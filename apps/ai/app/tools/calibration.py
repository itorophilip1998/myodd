"""Learn a small, regularized probability adjustment for each base-model/market pair."""
import logging
import math

from app.memory.model_store import read_active

logger = logging.getLogger(__name__)


def group_key(base_model, market_id):
    return f'{base_model}|{market_id}'


def calibrated(probability, parameters=(1., 0.)):
    probability = min(.999, max(.001, probability))
    slope, intercept = parameters
    z = max(-30, min(30, slope * math.log(probability / (1 - probability)) + intercept))
    return min(.999, max(.001, 1 / (1 + math.exp(-z))))


def fit(rows):
    """Newton updates with shrinkage toward the unchanged base model, bounded parameters."""
    slope, intercept = 1., 0.
    prior = 10.
    for _ in range(40):
        g0, g1, h00, h01, h11 = prior * (slope - 1), prior * intercept, prior, 0., prior
        for row in rows:
            p = row.baseProbability
            x = math.log(p / (1 - p))
            prediction = calibrated(p, (slope, intercept))
            error = prediction - (row.result == 'WON')
            variance = prediction * (1 - prediction)
            g0 += error * x
            g1 += error
            h00 += variance * x * x
            h01 += variance * x
            h11 += variance
        determinant = h00 * h11 - h01 * h01
        if determinant <= 0:
            break
        d0, d1 = (h11 * g0 - h01 * g1) / determinant, (h00 * g1 - h01 * g0) / determinant
        # Damped steps avoid overshooting on confident small datasets.
        scale = max(1., abs(d0), abs(d1))
        slope = max(.25, min(4., slope - d0 / scale))
        intercept = max(-4., min(4., intercept - d1 / scale))
        if max(abs(d0), abs(d1)) < 1e-7:
            break
    return [slope, intercept]


def apply_calibration(pool):
    try:
        artifact = read_active()
    except (OSError, ValueError, KeyError, TypeError):
        logger.warning('Learning artifact unavailable; retaining base predictions')
        artifact = None
    output = []
    for selection in pool:
        base = selection.baseProbability if selection.baseProbability is not None else selection.probability
        version = selection.baseModelVersion or selection.modelVersion
        parameters = artifact['parameters'].get(group_key(version, selection.marketId)) if artifact else None
        probability = round(calibrated(base, parameters), 6) if parameters else base
        output.append(selection.model_copy(update={
            'baseProbability': base, 'baseModelVersion': version, 'probability': probability,
            'confidence': round(probability * 100, 2),
            'modelVersion': f'{version}@{artifact["version"]}' if parameters else version,
        }))
    return output
