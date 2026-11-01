"""Prediction graph uses the configured scoring model, without ticket generation or LLM guesses."""
from app.prompt import load_prompt
from app.tools.scoring import score
from app.tools.calibration import apply_calibration


class PredictionAgent:
    system_prompt = load_prompt('prediction')

    async def predict(self, body, runtime):
        pool = apply_calibration(await score(body.fixtures, runtime))
        return {'pool': [s.model_dump(mode='json') for s in pool], 'modelVersion': next((s.modelVersion for s in pool if '@cal-v1-' in s.modelVersion), runtime.model.version)}
