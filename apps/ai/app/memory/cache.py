"""Bounded, process-local caches; not durable user storage."""
from app.schemas import Config

intent_cache: dict[tuple, tuple[float, Config]] = {}
trend_cache: dict = {'at': 0.0, 'rows': [], 'ttl': 0.0}
