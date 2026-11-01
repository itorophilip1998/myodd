"""Trusted result schema and deterministic deduplication before fitting/evaluation."""
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class OutcomeSample(BaseModel):
    id: str = Field(min_length=1, max_length=256)
    eventId: str = Field(min_length=1, max_length=256)
    marketId: str = Field(min_length=1, max_length=256)
    outcomeId: str = Field(min_length=1, max_length=256)
    specifier: str = Field(default='', max_length=512)
    marketName: str = Field(default='', max_length=512)
    league: str = Field(default='', max_length=512)
    mode: str | None = Field(default=None, max_length=32)
    probability: float = Field(gt=0, lt=1, allow_inf_nan=False)
    baseProbability: float = Field(gt=0, lt=1, allow_inf_nan=False)
    modelVersion: str = Field(min_length=1, max_length=256)
    baseModelVersion: str = Field(min_length=1, max_length=256)
    result: Literal['WON', 'LOST']
    predictedAt: datetime
    kickoffAt: datetime
    resultKnownAt: datetime

    @model_validator(mode='after')
    def chronological(self):
        times = (self.predictedAt, self.kickoffAt, self.resultKnownAt)
        if any(t.tzinfo is None for t in times):
            raise ValueError('Prediction and outcome timestamps must include a timezone')
        if not self.predictedAt < self.kickoffAt <= self.resultKnownAt <= datetime.now(timezone.utc):
            raise ValueError('Learning requires a pre-match prediction and a later verified result')
        return self


class LearningBatch(BaseModel):
    samples: list[OutcomeSample] = Field(max_length=10000)


def unique_samples(rows):
    # Repeated bookings/users do not turn one football outcome into hundreds of training examples.
    ordered = sorted(rows, key=lambda r: (r.predictedAt, r.id))
    unique = {}
    conflicts = set()
    for row in ordered:
        key = (row.eventId, row.marketId, row.outcomeId, row.specifier)
        if key in unique and unique[key].result != row.result:
            conflicts.add(key)
        if key not in unique:
            unique[key] = row
    return [row for key, row in unique.items() if key not in conflicts]
