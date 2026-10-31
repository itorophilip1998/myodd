"""Run the shared prediction model in the application's process pool."""
import asyncio

from app.llms.scoring import score_fixtures


async def score(fixtures, runtime):
    loop = asyncio.get_running_loop()
    chunks = [fixtures[i::runtime.prediction_workers] for i in range(runtime.prediction_workers)]
    batches = await asyncio.gather(*[
        loop.run_in_executor(runtime.executor, score_fixtures, chunk, runtime.model)
        for chunk in chunks if chunk
    ])
    return [selection for batch in batches for selection in batch]
