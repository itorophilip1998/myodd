"""Application setup; request handlers live in api/ and workflows in agents/."""
from contextlib import asynccontextmanager
from concurrent.futures import ProcessPoolExecutor
import multiprocessing
import os

from fastapi import FastAPI

from app.api.routes import router
from app.llms.scoring import load_model


@asynccontextmanager
async def lifespan(app):
    app.state.model = load_model()
    app.state.prediction_workers = max(1, min(8, int(os.getenv('PREDICTION_WORKERS', '2'))))
    app.state.executor = ProcessPoolExecutor(
        max_workers=app.state.prediction_workers, mp_context=multiprocessing.get_context('spawn'))
    try:
        yield
    finally:
        app.state.executor.shutdown(wait=True, cancel_futures=True)


app = FastAPI(title='myOdd AI', version='1.0.0', lifespan=lifespan)
app.include_router(router)
