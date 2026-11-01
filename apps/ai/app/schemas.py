from app.tools.generation_limits import validate_ticket_count
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import field_validator, BaseModel, Field, ConfigDict, model_validator


class Market(StrEnum):
    OTHER = 'OTHER'
    DRAW = 'DRAW'
    HOME = 'HOME'
    AWAY = 'AWAY'
    DOUBLE_CHANCE_1X = 'DOUBLE_CHANCE_1X'
    DOUBLE_CHANCE_X2 = 'DOUBLE_CHANCE_X2'
    DOUBLE_CHANCE_12 = 'DOUBLE_CHANCE_12'
    OVER_1_5 = 'OVER_1_5'
    OVER_2_5 = 'OVER_2_5'
    UNDER_3_5 = 'UNDER_3_5'
    BTTS_YES = 'BTTS_YES'
    BTTS_NO = 'BTTS_NO'


class MarketRule(BaseModel):
    marketId: str
    specifier: str | None = None
    outcomeIds: list[str] = Field(default_factory=list)


class Config(BaseModel):
    numberOfSlips: int = Field(default=10, ge=1, le=10)
    minimumOdds: float = Field(default=2.5, ge=1.1, allow_inf_nan=False)
    maximumOdds: float | None = Field(default=5, ge=1.1, allow_inf_nan=False)
    maximumSelections: int = Field(default=50, ge=1, le=50)
    minimumSelections: int = Field(default=1, ge=1, le=50)
    markets: list[Market] = Field(default_factory=list)
    marketQueries: list[str] = Field(default_factory=list)
    marketRules: list[MarketRule] = Field(default_factory=list)
    relatedMarketRules: list[MarketRule] = Field(default_factory=list)
    marketPolicy: str = Field(default='prefer', pattern='^(prefer|only)$')
    fixtureMode: str = Field(default='adaptive', pattern='^(adaptive|original_only|upcoming)$')
    preserveOriginalSelections: bool = False
    allowOddsAdjustment: bool = False
    minimumProbability: float | None = Field(default=None, ge=0, le=1)
    riskMode: str | None = Field(default=None, pattern='^(INVESTOR|GAMBLER|JAPA|LAGOS_LIFE)$')
    riskPreference: str = Field(default='LOWER', pattern='^(VERY_LOW|LOWER|MODERATE|HIGHER|VERY_HIGH)$')
    excludedTeams: list[str] = Field(default_factory=list)
    includedTeams: list[str] = Field(default_factory=list)
    includedLeagues: list[str] = Field(default_factory=list)
    excludedLeagues: list[str] = Field(default_factory=list)
    kickoffAfter: datetime | None = None
    kickoffBefore: datetime | None = None
    unhandledRequests: list[str] = Field(default_factory=list)

    @model_validator(mode='after')
    def valid_ranges(self):
        if self.maximumOdds is not None and self.minimumOdds > self.maximumOdds:
            self.minimumOdds, self.maximumOdds = self.maximumOdds, self.minimumOdds
        if self.minimumSelections > self.maximumSelections:
            raise ValueError('minimumSelections must not exceed maximumSelections')
        for deadline in (self.kickoffBefore, self.kickoffAfter):
            if deadline and deadline.tzinfo is None:
                raise ValueError('Kickoff deadlines must include a timezone')
        if self.kickoffAfter and self.kickoffBefore and self.kickoffAfter > self.kickoffBefore:
            raise ValueError('kickoffAfter must not exceed kickoffBefore')
        return self


class LearnedDefaults(BaseModel):
    riskMode: str | None = Field(default=None, pattern='^(INVESTOR|GAMBLER|JAPA|LAGOS_LIFE)$')
    ticketCount: int | None = Field(default=None, ge=1, le=10)
    gamesPerTicket: int | None = Field(default=None, ge=1, le=50)


    @field_validator('ticketCount', mode='before')
    @classmethod
    def cap_legacy_count(cls, value):
        return min(10, value) if isinstance(value, (int, float)) else value


class Instruction(BaseModel):
    learnedDefaults: LearnedDefaults = Field(default_factory=LearnedDefaults)
    instruction: str = Field(min_length=3, max_length=6000)
    availableMarkets: list[dict] = Field(default_factory=list, max_length=500)

    @model_validator(mode='after')
    def enforce_output_limit(self):
        validate_ticket_count(self.instruction)
        return self


class ResolveInput(Instruction):
    config: Config


class Outcome(BaseModel):
    outcomeId: str
    outcomeName: str
    odds: float = Field(gt=1, allow_inf_nan=False)
    isActive: bool


class BookmakerMarket(BaseModel):
    marketId: str
    marketName: str
    specifier: str = ''
    status: str = ''
    outcomes: list[Outcome]


class Fixture(BaseModel):
    eventId: str
    homeTeam: str
    awayTeam: str
    league: str
    kickoffAt: datetime
    matchStatus: str = ''
    markets: list[BookmakerMarket]


class Selection(BaseModel):
    model_config = ConfigDict(extra='ignore')
    eventId: str
    marketId: str
    outcomeId: str
    specifier: str = ''


class ScoredSelection(Selection):
    baseProbability: float | None = Field(default=None, gt=0, lt=1)
    baseModelVersion: str | None = None
    predictedAt: datetime | None = None
    odds: float
    homeTeam: str
    awayTeam: str
    league: str
    marketName: str
    selectionName: str
    kickoffAt: datetime
    isActive: bool = True
    supportedMarket: Market
    probability: float
    confidence: float
    modelVersion: str


class PredictionInput(BaseModel):
    fixtures: Annotated[list[Fixture], Field(max_length=200)]


class GenerateInput(BaseModel):
    expandedSearch: bool = False
    fixtures: Annotated[list[Fixture], Field(max_length=2500)]
    config: Config
    originalSelections: list[Selection] = Field(default_factory=list)


class SplitInput(GenerateInput):
    parts: int = Field(ge=1, le=10)
