"""Prediction graph uses the configured scoring model, without ticket generation or LLM guesses."""
from app.prompt import load_prompt
from app.tools.scoring import score


class PredictionAgent:
    system_prompt = load_prompt('prediction')

    async def predict(self, body, runtime):
        pool = await score(body.fixtures, runtime)
        return {'pool': [s.model_dump(mode='json') for s in pool], 'modelVersion': runtime.model.version}
