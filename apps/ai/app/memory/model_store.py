"""Shared, atomic model artifacts for all web/process workers on the AI data volume."""
import fcntl
import json
import math
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path


def model_path():
    return Path(os.getenv('LEARNING_MODEL_PATH', '/data/learning/active.json'))


def read_active():
    path = model_path()
    if not path.exists():
        return None
    artifact = json.loads(path.read_text())
    if artifact.get('format') != 'logit-calibration-v1' or not isinstance(artifact.get('parameters'), dict):
        raise ValueError('Invalid learning model artifact')
    for key in ('version', 'activatedAt', 'trainUntil', 'evaluatedThrough'):
        if not isinstance(artifact.get(key), str) or not artifact[key]:
            raise ValueError('Missing learning model metadata')
    for values in artifact['parameters'].values():
        if len(values) != 2 or not all(isinstance(v, (float, int)) and math.isfinite(v) for v in values):
            raise ValueError('Invalid calibration parameters')
        if not 0.25 <= values[0] <= 4 or not -4 <= values[1] <= 4:
            raise ValueError('Unsafe calibration parameters')
    return artifact


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.learning-', suffix='.json')
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(value, output, allow_nan=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def model_lock():
    path = model_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield path
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def model_status():
    try:
        artifact = read_active()
        path = model_path().with_name('last-evaluation.json')
        last = json.loads(path.read_text()) if path.exists() else None
        active = {k: artifact[k] for k in ('version', 'activatedAt', 'trainUntil', 'evaluatedThrough')} if artifact else None
        return {'state': 'active' if artifact else 'collecting', 'active': active, 'lastEvaluation': last}
    except (OSError, ValueError, KeyError, TypeError):
        return {'state': 'degraded', 'active': None, 'lastEvaluation': None,
                'reason': 'The learning artifact is unavailable or invalid; base predictions remain active.'}
