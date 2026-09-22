"""Private, immutable retry input. Application credentials are never included."""
import hashlib
import json
import os
import stat
import tempfile
from datetime import datetime, timezone

MAX_BYTES = 32 * 1024 * 1024
MAX_AGE_SECONDS = 2700

def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()

def save(path, capture):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    meta = path.parent.stat()
    if path.parent.is_symlink() or meta.st_uid != os.getuid() or stat.S_IMODE(meta.st_mode) != 0o700:
        raise ValueError('Unsafe checkpoint directory')
    data = encoded(capture)
    if len(data) > MAX_BYTES:
        raise ValueError('Capture too large')
    envelope = encoded({'capture': capture, 'sha256': hashlib.sha256(data).hexdigest()})
    fd, temporary = tempfile.mkstemp(prefix='.revenue-upload-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(envelope)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def load(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, 'rb') as source:
        meta = os.fstat(source.fileno())
        if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid() or stat.S_IMODE(meta.st_mode) != 0o600 or meta.st_size > MAX_BYTES:
            raise ValueError('Unsafe checkpoint file')
        envelope = json.load(source)
    capture = envelope['capture']
    if hashlib.sha256(encoded(capture)).hexdigest() != envelope['sha256']:
        raise ValueError('Checkpoint digest mismatch')
    completed = datetime.fromisoformat(capture['payload']['collectorCompletedAt'].replace('Z', '+00:00'))
    age = (datetime.now(timezone.utc) - completed).total_seconds()
    if age < 0 or age > MAX_AGE_SECONDS:
        return None
    return capture
