"""HTTP validation and response formatting only; agents own orchestration."""
from fastapi import APIRouter, HTTPException, Request

from app.agents import PREDICTION_AGENT, get_agent
from app.llms.errors import IntentProviderError
from app.llms.client import health_intent_fields
from app.prompt import instruction_mode
from app.schemas import GenerateInput, Instruction, PredictionInput, ResolveInput, SplitInput
from app.tools.discovery import DiscoveryRequest, discover
from app.tools.market_preferences import resolve_preferences
from app.tools.risk_modes import ModeConstraintError

router = APIRouter()


@router.get('/health')
def health(request: Request):
    return {'ok': True, 'service': 'myodd-ai', 'modelVersion': request.app.state.model.version, **health_intent_fields()}


@router.post('/tools/discover-codes')
def discover_codes(body: DiscoveryRequest):
    return discover(body)


@router.post('/intent')
def intent(body: Instruction):
    try:
        defaults = body.learnedDefaults.model_dump()
        mode = instruction_mode(body.instruction, defaults.get('riskMode')).upper()
        return get_agent(mode).plan(body.instruction, body.availableMarkets, defaults).model_dump(mode='json')
    except IntentProviderError as exc:
        raise HTTPException(502, str(exc)) from None
    except ModeConstraintError as exc:
        raise HTTPException(422, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(422, 'Instructions contain invalid generation settings') from exc


@router.post('/resolve')
def resolve(body: ResolveInput):
    return resolve_preferences(body.config, body.availableMarkets, body.instruction).model_dump(mode='json')


async def run_generation(body, request, mode):
    try:
        return await get_agent(mode).generate(body, request.app.state)
    except ModeConstraintError as exc:
        raise HTTPException(422, str(exc)) from None


@router.post('/generate')
async def generate(body: GenerateInput, request: Request):
    return await run_generation(body, request, body.config.riskMode)


@router.post('/generate/investor')
async def investor(body: GenerateInput, request: Request):
    return await run_generation(body, request, 'INVESTOR')


@router.post('/generate/gambler')
async def gambler(body: GenerateInput, request: Request):
    return await run_generation(body, request, 'GAMBLER')


@router.post('/generate/japa')
async def japa(body: GenerateInput, request: Request):
    return await run_generation(body, request, 'JAPA')


@router.post('/generate/lagos-life')
async def lagos_life(body: GenerateInput, request: Request):
    return await run_generation(body, request, 'LAGOS_LIFE')


@router.post('/tools/split')
@router.post('/split')
async def split(body: SplitInput, request: Request):
    return await get_agent(body.config.riskMode).split(body, request.app.state)


@router.post('/generate/prediction')
@router.post('/predictions')
async def prediction(body: PredictionInput, request: Request):
    return await PREDICTION_AGENT.predict(body, request.app.state)
