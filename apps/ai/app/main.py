from contextlib import asynccontextmanager
import asyncio
import multiprocessing
import os
from concurrent.futures import ProcessPoolExecutor

from fastapi import FastAPI, HTTPException

from .generation import generate_report
from .splitting import split_report
from .intent import parse_intent
from .predictions import load_model, score_fixtures
from .schemas import GenerateInput, Instruction, ResolveInput, SplitInput, PredictionInput
from .market_preferences import resolve_preferences
from .groq import GroqIntentError
from .risk_modes import ModeConstraintError
from .discovery import DiscoveryRequest, discover


@asynccontextmanager
async def lifespan(app):
    app.state.model = load_model()
    app.state.prediction_workers = max(1, min(8, int(os.getenv('PREDICTION_WORKERS', '2'))))
    app.state.executor = ProcessPoolExecutor(max_workers=app.state.prediction_workers, mp_context=multiprocessing.get_context('spawn'))
    try:
        yield
    finally:
        app.state.executor.shutdown(wait=True, cancel_futures=True)


app = FastAPI(title='myOdd AI', version='1.0.0', lifespan=lifespan)


@app.get('/health')
def health():
    provider = os.getenv('AI_PROVIDER') or os.getenv('INTENT_PROVIDER', 'rules')
    return {'ok': True, 'service': 'myodd-ai', 'modelVersion': app.state.model.version,
            'intentProvider': provider,
            'intentModel': os.getenv('AI_MODEL', 'qwen/qwen3.8-27b') if provider == 'groq' else os.getenv('OLLAMA_MODEL', 'llama3.2') if provider == 'ollama' else None}


@app.post('/tools/discover-codes')
def discover_codes(body: DiscoveryRequest):
    return discover(body)


@app.post('/intent')
def intent(body: Instruction):
    try:
        return parse_intent(body.instruction, body.availableMarkets, body.learnedDefaults.model_dump()).model_dump(mode='json')
    except GroqIntentError as exc:
        raise HTTPException(502, str(exc)) from None
    except ModeConstraintError as exc:
        raise HTTPException(422, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(422, 'Instructions contain invalid generation settings') from exc


@app.post('/resolve')
def resolve(body: ResolveInput):
    return resolve_preferences(body.config, body.availableMarkets, body.instruction).model_dump(mode='json')


@app.post('/generate')
async def generation(body: GenerateInput):
    loop = asyncio.get_running_loop()
    # Separate processes execute fixture scoring in parallel, including CPU-bound models.
    chunks = [body.fixtures[i::app.state.prediction_workers] for i in range(app.state.prediction_workers)]
    batches = await asyncio.gather(*[
        loop.run_in_executor(app.state.executor, score_fixtures, chunk, app.state.model)
        for chunk in chunks if chunk
    ])
    pool = [selection for batch in batches for selection in batch]
    report = await loop.run_in_executor(app.state.executor, generate_report, pool, body.config, body.originalSelections, body.expandedSearch)
    return {'pool': [s.model_dump(mode='json') for s in pool],
            **report,
            'modelVersion': app.state.model.version}


@app.post('/split')
async def split_booking(body: SplitInput):
    loop = asyncio.get_running_loop()
    pool = await loop.run_in_executor(app.state.executor, score_fixtures, body.fixtures, app.state.model)
    report = await loop.run_in_executor(app.state.executor, split_report, pool, body.config, body.originalSelections, body.parts)
    return {'pool': [s.model_dump(mode='json') for s in pool], **report, 'modelVersion': app.state.model.version}


@app.post('/predictions')
async def prediction_snapshot(body: PredictionInput):
    loop = asyncio.get_running_loop()
    chunks = [body.fixtures[i::app.state.prediction_workers] for i in range(app.state.prediction_workers)]
    batches = await asyncio.gather(*[
        loop.run_in_executor(app.state.executor, score_fixtures, chunk, app.state.model)
        for chunk in chunks if chunk
    ])
    return {'pool': [s.model_dump(mode='json') for batch in batches for s in batch], 'modelVersion': app.state.model.version}
