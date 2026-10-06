import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch
import test_revenue_collector as fixtures
import revenue_transport as transport
import revenue_checkpoint as checkpoint
import collect_all_revenue as collector
from revenue_progress import Progress
import revenue_ads_history as ads
from datetime import date

class Response(fixtures.FakeResponse):
    def raise_for_status(self):
        if self.status_code >= 400:
            error = RuntimeError('Controlled HTTP failure')
            error.response = self
            raise error

def capture():
    now=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    return {'payload':{'collectorRunId':str(uuid.uuid4()),'collectorStartedAt':now,'collectorCompletedAt':now},
            'audit':None,'successful':True,'origin':'manual'}

class RecoveryTests(unittest.TestCase):
    def tearDown(self):
        transport.collection_deadline = None

    def test_partial_inputs_survive_restart_without_new_ids_or_timestamps(self):
        with tempfile.TemporaryDirectory() as directory:
            value=capture()['payload']; path=Path(directory)/'partial.json'
            p=Progress(path,value['collectorRunId'],value['collectorStartedAt'],'2026-10-06T12:00:00-05:00','scheduled','publish')
            fetch=Mock(return_value={'private':'input'})
            p.memo('close',fetch,lambda:value['collectorStartedAt'])
            resumed=Progress.resume(path,'scheduled','publish')
            self.assertEqual(resumed.value['payload'],p.value['payload'])
            self.assertEqual(resumed.memo('close',fetch,lambda:'WRONG'),({'private':'input'},value['collectorStartedAt']))
            fetch.assert_called_once()
            self.assertIsNone(Progress.resume(path,'manual','publish'))
            with self.assertRaises(ValueError):p.put('close',{'changed':True},value['collectorStartedAt'])

    def test_budget_exhaustion_does_not_start_another_request(self):
        transport.collection_deadline=0
        request=Mock()
        with self.assertRaises(transport.requests.Timeout):transport.request_with_retry(request,'https://example.test')
        request.assert_not_called()

    def test_partial_capture_expiry_and_parallel_writes(self):
        from concurrent.futures import ThreadPoolExecutor
        with tempfile.TemporaryDirectory() as directory:
            value=capture()['payload'];path=Path(directory)/'partial.json'
            p=Progress(path,value['collectorRunId'],value['collectorStartedAt'],'cutoff','manual','publish')
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda i:p.put(str(i),i,value['collectorStartedAt']),range(20)))
            self.assertEqual(len(Progress.resume(path,'manual','publish').value['entries']),20)
            p.value['payload']['collectorStartedAt']=(datetime.now(timezone.utc)-timedelta(minutes=21)).isoformat()
            checkpoint.save(path,p.value)
            self.assertIsNone(Progress.resume(path,'manual','publish'))

    def test_diagnostic_logs_do_not_contain_request_payload(self):
        request=Mock(return_value=Response())
        with self.assertLogs('revenue_transport',level='INFO') as logs:
            transport.request_with_retry(request,'https://example.test',diagnostic=('adsbymoney','2026-01-01','2026-01-31'),json={'api_token':'NEVER_LOG_ME'})
        self.assertNotIn('NEVER_LOG_ME',' '.join(logs.output))
        self.assertIn('status=200',' '.join(logs.output))

    def test_ads_retries_only_failed_months_and_preserves_successful_checkpoints(self):
        bounds=[(date(2026,m,1),datetime(2026,m,28,tzinfo=timezone.utc)) for m in (1,2,3)]
        calls=[]
        def fetch(key,end,**kwargs):
            calls.append(end.month)
            if end.month==2 and calls.count(2)==1:raise transport.requests.Timeout()
            return end.month
        with tempfile.TemporaryDirectory() as directory:
            v=capture()['payload'];p=Progress(Path(directory)/'p.json',v['collectorRunId'],v['collectorStartedAt'],'cutoff','manual','publish')
            with patch.object(ads.revenue,'fetch_adsbymoney_ytd',side_effect=fetch):
                result=ads.fetch_history('secret',bounds,p)
                again=ads.fetch_history('secret',bounds,p)
            self.assertEqual(result,again);self.assertEqual(calls,[1,2,3,2])
            self.assertEqual(len(p.value['entries']),3)

    def test_provider_retry_after_blocks_other_months_when_over_budget(self):
        bounds=[(date(2026,m,1),datetime(2026,m,28,tzinfo=timezone.utc)) for m in (1,2)]
        response=Response(status_code=429);response.headers={'Retry-After':'3600'}
        error=RuntimeError('Controlled');error.response=response
        fetch=Mock(side_effect=error)
        with patch.object(ads.revenue,'fetch_adsbymoney_ytd',fetch),self.assertRaises(RuntimeError):
            ads.fetch_history('secret',bounds)
        fetch.assert_called_once()

    def test_ads_does_not_subdivide_after_failed_provider_parity(self):
        bounds=[(date(2024,m,1),datetime(2024,m,29 if m==2 else 31,tzinfo=timezone.utc)) for m in (1,2,3)]
        calls=[]
        def fetch(key,end,**kwargs):
            start=kwargs['start_date'];calls.append((start,end.date()))
            if start==date(2024,3,1) and end.day==31:raise transport.requests.Timeout()
            return (end.date()-start).days+1
        with patch.object(ads.revenue,'fetch_adsbymoney_ytd',side_effect=fetch),self.assertRaises(transport.requests.Timeout):
            ads.fetch_history('secret',bounds)
        self.assertEqual(calls.count((date(2024,3,1),date(2024,3,31))),3)
        self.assertEqual(len(calls),5)
        self.assertEqual(ads.cents(1.005),100)

    def test_ads_nonadditive_reports_and_permanent_errors_fail_closed(self):
        bounds=[(date(2026,m,1),datetime(2026,m,28,tzinfo=timezone.utc)) for m in (1,2,3)]
        def fetch(key,end,**kwargs):
            if end.month==3:raise transport.requests.Timeout()
            return 100
        with patch.object(ads.revenue,'fetch_adsbymoney_ytd',side_effect=fetch),self.assertRaises(transport.requests.Timeout):
            ads.fetch_history('secret',bounds)
        fetch=Mock(side_effect=ads.revenue.ConnectorError('validation'))
        with patch.object(ads.revenue,'fetch_adsbymoney_ytd',fetch),self.assertRaises(ads.revenue.ConnectorError):
            ads.fetch_history('secret',bounds)
        fetch.assert_called_once()

    def test_transient_requests_retry_same_inputs_and_respect_retry_after(self):
        limited=Response(status_code=429);limited.headers={'Retry-After':'12'}
        request=Mock(side_effect=[limited,Response(payload={'ok':True})])
        with patch.object(transport.time,'sleep') as sleep:
            result=transport.request_with_retry(request,'https://example.test',json={'immutable':'input'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(request.call_args_list[0],request.call_args_list[1])
        self.assertGreaterEqual(sleep.call_args.args[0],12)

    def test_auth_validation_and_classified_execution_limit_do_not_retry(self):
        for status,body in [(401,{}),(422,{}),(503,{'retryable':False,'code':'execution_limit'})]:
            request=Mock(return_value=Response(status_code=status,payload=body))
            with patch.object(transport.time,'sleep') as sleep:
                transport.request_with_retry(request,'https://example.test')
            request.assert_called_once();sleep.assert_not_called()

    def test_long_retry_after_aborts_instead_of_retrying_early(self):
        response=Response(status_code=429);response.headers={'Retry-After':'3600'}
        request=Mock(return_value=response)
        with patch.object(transport.time,'sleep') as sleep:
            self.assertIs(transport.request_with_retry(request,'https://example.test'),response)
        request.assert_called_once();sleep.assert_not_called()

    def test_timeout_is_bounded(self):
        request=Mock(side_effect=transport.requests.Timeout())
        with patch.object(transport.time,'sleep'),self.assertRaises(transport.requests.Timeout):
            transport.request_with_retry(request,'https://example.test')
        self.assertEqual(request.call_count,3)

    def test_checkpoint_preserves_identity_and_timestamps_and_rejects_unsafe_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'pending.json';value=capture();checkpoint.save(path,value)
            self.assertEqual(path.stat().st_mode & 0o777,0o600)
            self.assertEqual(checkpoint.load(path),value)
            os.chmod(path,0o644)
            with self.assertRaises(ValueError):checkpoint.load(path)
            os.chmod(path,0o600)
            old=capture();old['payload']['collectorCompletedAt']=(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat()
            checkpoint.save(path,old);self.assertIsNone(checkpoint.load(path))
            link=Path(directory)/'link';link.symlink_to(path)
            with self.assertRaises(OSError):checkpoint.load(link)

    def test_upload_resume_uses_same_capture_without_refetching_connectors(self):
        with tempfile.TemporaryDirectory() as directory:
            value=capture();secrets=fixtures.runtime_secrets();posts=[];fail=True
            def post(url,**kwargs):
                nonlocal fail
                if url.endswith('/collection-run'):
                    posts.append(kwargs['json'])
                    return Response(status_code=503,payload={'retryable':False,'code':'execution_limit'}) if fail else Response(payload={'verified':True,'published':True})
                return Response(payload={'ok':True})
            def collect(**kwargs):
                value['payload'].update(collectorRunId=kwargs['run_id'],collectorStartedAt=kwargs['started'])
                return value['payload'],None,secrets,True
            with patch.dict(os.environ,{'REVENUE_STATE_DIR':directory}),patch.object(collector.revenue,'load_runtime_secrets',return_value=secrets), \
                 patch.object(collector,'collect_payload',side_effect=collect) as fetch,patch.object(collector.revenue.requests,'post',side_effect=post):
                self.assertEqual(collector.main(),78)
                self.assertTrue((Path(directory)/'pending-upload.json').exists())
                fail=False
                self.assertEqual(collector.main(),0)
                fetch.assert_called_once()
            self.assertEqual(posts[0],posts[1]);self.assertFalse((Path(directory)/'pending-upload.json').exists())

if __name__=='__main__':unittest.main()
