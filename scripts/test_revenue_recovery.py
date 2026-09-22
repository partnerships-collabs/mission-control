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
