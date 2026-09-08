#!/usr/bin/env python3
"""Secret-free regression tests for the staged revenue collector."""

from __future__ import annotations

import base64
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock


class FakeResponse:
    def __init__(self, *, payload=None, text="", status_code=200):
        self.payload = payload
        self.text = text
        self.status_code = status_code

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


requests_stub = types.ModuleType("requests")
requests_stub.get = mock.Mock()
requests_stub.post = mock.Mock()
sys.modules["requests"] = requests_stub

secret_loader_stub = types.ModuleType("secret_loader")
secret_loader_stub.read_secret = mock.Mock(side_effect=AssertionError("unexpected secret read"))
scripts_stub = types.ModuleType("scripts")
scripts_stub.__path__ = []
scripts_secret_loader_stub = types.ModuleType("scripts.secret_loader")
scripts_secret_loader_stub.read_secret = secret_loader_stub.read_secret
sys.modules["secret_loader"] = secret_loader_stub
sys.modules["scripts"] = scripts_stub
sys.modules["scripts.secret_loader"] = scripts_secret_loader_stub

SOURCE_PATH = Path(__file__).with_name("revenue_collector.py")
SPEC = importlib.util.spec_from_file_location("mission_control_revenue_collector", SOURCE_PATH)
assert SPEC and SPEC.loader
collector = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = collector
SPEC.loader.exec_module(collector)


def service_account_fixture() -> dict:
    return {
        "type": "service_account",
        "client_email": "msn-reader@example.test",
        "private_key": "test-private-key",
        "token_uri": "https://oauth2.example.test/token",
    }


def runtime_secrets(**overrides):
    values = {
        "activity_secret": "activity",
        "close_api_key": "close",
        "impact_sid": "impact-sid",
        "impact_reporting_password": "impact-password",
        "redventures_client_id": "rv-id",
        "redventures_client_secret": "rv-secret",
        "adsbymoney_api_key": "abm",
        "msn_google_service_account": service_account_fixture(),
        "source_errors": {},
        "activity_error": None,
    }
    values.update(overrides)
    return collector.RuntimeSecrets(**values)


class ConnectorTests(unittest.TestCase):
    def test_close_paginates_and_converts_cents(self):
        pages = [
            {
                "data": [
                    {
                        "id": "one",
                        "value": 12345,
                        "value_currency": "USD",
                        "value_period": "one_time",
                    }
                ],
                "has_more": True,
            },
            {
                "data": [
                    {
                        "id": "two",
                        "value": 55,
                        "value_currency": "USD",
                        "value_period": "one_time",
                    }
                ],
                "has_more": False,
            },
        ]
        calls = []

        def get(_url, **kwargs):
            calls.append(dict(kwargs["params"]))
            return FakeResponse(payload=pages[len(calls) - 1])

        with mock.patch.object(collector.requests, "get", side_effect=get):
            total = collector.fetch_close_ytd(
                datetime(2026, 1, 1), datetime(2026, 9, 8), "not-a-real-secret"
            )

        self.assertEqual(total, 124.0)
        self.assertEqual([call["_skip"] for call in calls], [0, 100])
        self.assertEqual(calls[0]["status_type"], "won")
        self.assertEqual(calls[0]["date_won__gte"], "2026-01-01")
        self.assertEqual(calls[0]["date_won__lte"], "2026-09-08")

    def test_close_fails_with_aggregate_counts_for_missing_or_wrong_semantics(self):
        payload = {
            "data": [
                {
                    "id": "must-not-leak-one",
                    "value": 100,
                    "value_period": "one_time",
                },
                {
                    "id": "must-not-leak-two",
                    "value": 200,
                    "value_currency": "EUR",
                    "value_period": "monthly",
                },
            ],
            "has_more": False,
        }
        with mock.patch.object(
            collector.requests, "get", return_value=FakeResponse(payload=payload)
        ):
            with self.assertRaises(collector.ConnectorError) as caught:
                collector.fetch_close_ytd(
                    datetime(2026, 1, 1), datetime(2026, 9, 8), "dummy"
                )
        message = str(caught.exception)
        self.assertIn("records=2", message)
        self.assertIn("invalidCurrency=2", message)
        self.assertIn("invalidValuePeriod=1", message)
        self.assertNotIn("must-not-leak", message)
        self.assertNotIn("EUR", message)

    def test_close_allows_a_legitimate_empty_last_30_day_window(self):
        with mock.patch.object(
            collector.requests,
            "get",
            return_value=FakeResponse(payload={"data": [], "has_more": False}),
        ):
            total = collector.fetch_close_ytd(
                datetime(2026, 8, 9),
                datetime(2026, 9, 8),
                "dummy",
                require_rows=False,
            )
        self.assertEqual(total, 0.0)

    def test_impact_sums_total_cost(self):
        report = (
            "<Response><Status>OK</Status><Records>"
            "<Record><Total_Cost>12.34</Total_Cost><Currency>USD</Currency></Record>"
            "<Record><Total_Cost>2.66</Total_Cost><Currency>USD</Currency></Record>"
            "</Records></Response>"
        )
        with mock.patch.object(
            collector.requests, "get", return_value=FakeResponse(text=report)
        ):
            total = collector.fetch_impact_ytd(
                "sid", "token", datetime(2026, 9, 8)
            )
        self.assertEqual(total, 15.0)

    def test_redventures_windows_cover_ytd_without_overlap(self):
        windows = collector._redventures_windows(date(2026, 9, 8))
        self.assertEqual(windows[0][0], "2026-01-01 00:00:00")
        self.assertEqual(windows[-1][1], "2026-09-08 23:59:59")
        for start_text, end_text in windows:
            start = datetime.strptime(start_text, "%Y-%m-%d %H:%M:%S")
            end = datetime.strptime(end_text, "%Y-%m-%d %H:%M:%S")
            self.assertLessEqual((end.date() - start.date()).days + 1, 31)
        for previous, following in zip(windows, windows[1:]):
            previous_end = datetime.strptime(previous[1], "%Y-%m-%d %H:%M:%S")
            following_start = datetime.strptime(following[0], "%Y-%m-%d %H:%M:%S")
            self.assertEqual(following_start - previous_end, collector.timedelta(seconds=1))

    def test_close_last_30_day_window_has_30_inclusive_dates(self):
        now = datetime(2026, 9, 8, 12, 0)
        start = collector.inclusive_last_30_day_start(now)
        self.assertEqual(start.date(), date(2026, 8, 10))
        self.assertEqual((now.date() - start.date()).days + 1, 30)

    def test_redventures_sums_every_valid_window(self):
        calls = []

        def get(_url, **kwargs):
            calls.append(kwargs["params"])
            return FakeResponse(
                payload={"overviewReporting": {"page": [{"commission": "10.25"}]}}
            )

        with (
            mock.patch.object(
                collector.requests,
                "post",
                return_value=FakeResponse(payload={"access_token": "token"}),
            ),
            mock.patch.object(collector.requests, "get", side_effect=get),
        ):
            total = collector.fetch_redventures_ytd(
                "id", "secret", "50812", datetime(2026, 9, 8)
            )
        self.assertEqual(total, len(calls) * 10.25)

    def test_adsbymoney_sums_campaign_earnings(self):
        with mock.patch.object(
            collector.requests,
            "post",
            return_value=FakeResponse(
                payload={"data": [{"earnings": "1.25"}, {"earnings": 2.5}]}
            ),
        ):
            total = collector.fetch_adsbymoney_ytd("token", datetime(2026, 9, 8))
        self.assertEqual(total, 3.75)

    def test_msn_uses_only_b9_and_readonly_scope(self):
        calls = {}

        class Credentials:
            token = None

            @classmethod
            def from_service_account_info(cls, info, scopes):
                calls["info"] = info
                calls["scopes"] = scopes
                return cls()

            def refresh(self, _request):
                self.token = "temporary-access-token"

        google = types.ModuleType("google")
        google.__path__ = []
        google_auth = types.ModuleType("google.auth")
        google_auth.__path__ = []
        google_auth_transport = types.ModuleType("google.auth.transport")
        google_auth_transport.__path__ = []
        google_auth_requests = types.ModuleType("google.auth.transport.requests")
        google_auth_requests.Request = object
        google_oauth2 = types.ModuleType("google.oauth2")
        google_oauth2.__path__ = []
        google_service_account = types.ModuleType("google.oauth2.service_account")
        google_service_account.Credentials = Credentials
        google_oauth2.service_account = google_service_account
        modules = {
            "google": google,
            "google.auth": google_auth,
            "google.auth.transport": google_auth_transport,
            "google.auth.transport.requests": google_auth_requests,
            "google.oauth2": google_oauth2,
            "google.oauth2.service_account": google_service_account,
        }
        with (
            mock.patch.dict(sys.modules, modules),
            mock.patch.object(
                collector.requests,
                "get",
                return_value=FakeResponse(payload={"values": [[123456.78]]}),
            ) as get,
        ):
            total = collector.fetch_msn_ytd(service_account_fixture())

        self.assertEqual(total, 123456.78)
        self.assertEqual(calls["scopes"], [collector.SHEETS_READONLY_SCOPE])
        url = get.call_args.args[0]
        self.assertIn("/values/Sheet1%21B9", url)
        self.assertEqual(get.call_args.kwargs["params"]["valueRenderOption"], "UNFORMATTED_VALUE")

    def test_no_stale_msn_fallback_exists(self):
        source = SOURCE_PATH.read_text()
        self.assertNotIn("msn_monthly.json", source)
        self.assertNotIn("google_docs_token", source)


class CredentialAndHealthTests(unittest.TestCase):
    def test_service_account_can_be_injected_as_base64_json(self):
        encoded = base64.b64encode(json.dumps(service_account_fixture()).encode()).decode()
        with mock.patch.dict(
            collector.os.environ,
            {"MSN_GOOGLE_SERVICE_ACCOUNT_B64": encoded},
            clear=True,
        ):
            loaded = collector.load_msn_service_account()
        self.assertEqual(loaded["client_email"], "msn-reader@example.test")

    def test_service_account_can_be_loaded_from_one_explicit_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json") as handle:
            json.dump(service_account_fixture(), handle)
            handle.flush()
            with mock.patch.dict(
                collector.os.environ,
                {"MSN_GOOGLE_SERVICE_ACCOUNT_FILE": handle.name},
                clear=True,
            ):
                loaded = collector.load_msn_service_account()
        self.assertEqual(loaded["type"], "service_account")

    def test_service_account_has_no_implicit_default(self):
        with mock.patch.dict(collector.os.environ, {}, clear=True):
            with self.assertRaises(collector.ConnectorError):
                collector.load_msn_service_account()

    def test_controlled_error_mapper_covers_only_fixed_safe_categories(self):
        secret = (
            "Authorization: Bearer secret-value api_key=api_abcdef "
            "https://private.example.test/path "
            "-----BEGIN PRIVATE KEY----- private-key-body"
        )

        class HttpFailure(RuntimeError):
            pass

        http_failure = HttpFailure(secret)
        http_failure.response = types.SimpleNamespace(status_code=401)
        cases = (
            (collector.ConnectorError("credential_unavailable"), "credential unavailable"),
            (TimeoutError(secret), "request timed out"),
            (ConnectionError(secret), "connection failed"),
            (http_failure, "HTTP request failed (status=401)"),
            (json.JSONDecodeError(secret, secret, 0), "malformed response"),
            (collector.ConnectorError("validation"), "validation failed"),
            (collector.ConnectorError("empty_data"), "empty data"),
            (ModuleNotFoundError(secret), "missing dependency"),
            (RuntimeError(secret), "unexpected failure"),
            (collector.ConnectorError(secret), "unexpected failure"),
        )
        for error, expected in cases:
            with self.subTest(expected=expected):
                message = collector.controlled_error_message(error)
                self.assertEqual(message, expected)
                self.assertNotIn("secret-value", message)
                self.assertNotIn("api_abcdef", message)
                self.assertNotIn("private.example.test", message)
                self.assertNotIn("PRIVATE KEY", message)

    def test_arbitrary_exception_content_never_enters_health_or_logs(self):
        secret = (
            "Bearer secret-value https://private.example.test/path "
            "-----BEGIN PRIVATE KEY----- private-key-body"
        )

        def fail():
            raise RuntimeError(secret)

        with self.assertLogs(collector.log, level="ERROR") as captured:
            health = collector.collect_source("msn", fail)

        self.assertEqual(health.error, "unexpected failure")
        combined_logs = "\n".join(captured.output)
        for raw_fragment in (
            "secret-value",
            "private.example.test",
            "PRIVATE KEY",
            "private-key-body",
        ):
            self.assertNotIn(raw_fragment, health.error or "")
            self.assertNotIn(raw_fragment, combined_logs)

    def test_collector_has_no_raw_exception_sanitizer_or_old_post_route(self):
        source = SOURCE_PATH.read_text()
        self.assertNotIn("sanitize_error", source)
        self.assertNotIn("str(error)", source)
        self.assertNotIn("/revenue/snapshot", source)

class RunContractTests(unittest.TestCase):
    def health(self, *, failed=None):
        result = {}
        for index, source in enumerate(collector.SOURCE_NAMES, start=1):
            if source == failed:
                result[source] = collector.SourceHealth(
                    None, "failed", "2026-09-08T17:00:00Z", False, "unexpected failure"
                )
            else:
                result[source] = collector.SourceHealth(
                    float(index), "success", "2026-09-08T17:00:00Z", False
                )
        return result

    def test_success_payload_leaves_all_revenue_math_to_convex(self):
        payload = collector.build_run_payload(
            "run-id",
            "2026-09-08T17:00:00Z",
            "2026-09-08T17:01:00Z",
            "2026-09-08",
            self.health(),
            1.0,
        )
        self.assertEqual(set(payload["sourceHealth"]), set(collector.SOURCE_NAMES))
        self.assertEqual(payload["closeLast30DayUsd"], 1.0)
        for field in ("sources", "totalYtdUsd", "last30DayUsd", "projectedAnnualUsd"):
            self.assertNotIn(field, payload)

    def test_failed_payload_omits_every_publishable_total(self):
        payload = collector.build_run_payload(
            "run-id",
            "2026-09-08T17:00:00Z",
            "2026-09-08T17:01:00Z",
            "2026-09-08",
            self.health(failed="msn"),
            1.0,
        )
        for field in (
            "sources",
            "totalYtdUsd",
            "closeLast30DayUsd",
            "last30DayUsd",
            "projectedAnnualUsd",
        ):
            self.assertNotIn(field, payload)

    def test_run_report_retries_idempotently_with_the_same_run_id(self):
        payload = {
            "collectorRunId": "stable-run-id",
            "sourceHealth": {},
        }
        secret = (
            "Bearer secret-value https://private.example.test/path "
            "-----BEGIN PRIVATE KEY----- private-key-body"
        )
        with (
            mock.patch.object(
                collector.requests,
                "post",
                side_effect=[
                    RuntimeError(secret),
                    FakeResponse(payload={"published": False, "runId": "stable-run-id"}),
                ],
            ) as post,
            mock.patch.object(collector.time, "sleep") as sleep,
            self.assertLogs(collector.log, level="WARNING") as captured,
        ):
            result = collector.post_run_report(payload, "activity")

        self.assertFalse(result["published"])
        self.assertEqual(post.call_count, 2)
        self.assertEqual(
            post.call_args_list[0].args[0],
            f"{collector.SITE_URL}/revenue/collection-run",
        )
        self.assertIs(post.call_args_list[0].kwargs["json"], payload)
        self.assertIs(post.call_args_list[1].kwargs["json"], payload)
        sleep.assert_called_once_with(1)
        combined_logs = "\n".join(captured.output)
        self.assertIn("unexpected failure", combined_logs)
        self.assertNotIn("secret-value", combined_logs)
        self.assertNotIn("private.example.test", combined_logs)
        self.assertNotIn("PRIVATE KEY", combined_logs)

    def test_failed_run_is_reported_but_exits_nonzero(self):
        captured = {}

        def record(payload, _secret):
            captured.update(payload)
            return {"published": False, "runId": "convex-run-id", "ok": True}

        with (
            mock.patch.object(collector, "load_runtime_secrets", return_value=runtime_secrets()),
            mock.patch.object(collector, "fetch_close_ytd", side_effect=[100.0, 20.0]),
            mock.patch.object(collector, "fetch_impact_ytd", return_value=200.0),
            mock.patch.object(collector, "fetch_redventures_ytd", return_value=300.0),
            mock.patch.object(collector, "fetch_adsbymoney_ytd", return_value=400.0),
            mock.patch.object(collector, "fetch_msn_ytd", side_effect=RuntimeError("sheet denied")),
            mock.patch.object(collector, "post_run_report", side_effect=record) as post,
        ):
            status = collector.main(dry_run=False)

        self.assertEqual(status, 1)
        post.assert_called_once()
        self.assertEqual(captured["sourceHealth"]["msn"]["status"], "failed")
        self.assertNotIn("totalYtdUsd", captured)

    def test_successful_run_is_reported_and_exits_zero(self):
        captured = {}

        def record(payload, _secret):
            captured.update(payload)
            return {"published": True, "runId": "convex-run-id", "ok": True}

        with (
            mock.patch.object(collector, "load_runtime_secrets", return_value=runtime_secrets()),
            mock.patch.object(collector, "fetch_close_ytd", side_effect=[100.0, 20.0]),
            mock.patch.object(collector, "fetch_impact_ytd", return_value=200.0),
            mock.patch.object(collector, "fetch_redventures_ytd", return_value=300.0),
            mock.patch.object(collector, "fetch_adsbymoney_ytd", return_value=400.0),
            mock.patch.object(collector, "fetch_msn_ytd", return_value=500.0),
            mock.patch.object(collector, "post_run_report", side_effect=record) as post,
        ):
            status = collector.main(dry_run=False)

        self.assertEqual(status, 0)
        post.assert_called_once()
        self.assertEqual(captured["sourceHealth"]["close"]["amountUsd"], 100.0)
        self.assertEqual(captured["sourceHealth"]["msn"]["amountUsd"], 500.0)
        self.assertNotIn("totalYtdUsd", captured)
        self.assertTrue(all(not item["reused"] for item in captured["sourceHealth"].values()))


if __name__ == "__main__":
    unittest.main(verbosity=2)
