"""Environment-based provider configuration and fast/accurate model routing."""
import math
import os
import re
from dataclasses import dataclass, field
from typing import Any

from .errors import IntentProviderError


@dataclass(frozen=True)
class ProviderSpec:
    name: str
    label: str
    default_model: str
    default_base_url: str
    key_envs: tuple[str, ...] = ('AI_API_KEY',)
    model_envs: tuple[str, ...] = ('AI_MODEL',)
    token_field: str = 'max_tokens'
    request_extras: dict[str, Any] = field(default_factory=dict)
    requires_key: bool = True


PROVIDERS: dict[str, ProviderSpec] = {
    'openai': ProviderSpec(
        name='openai',
        label='OpenAI',
        # Default to broadly enabled chat models. GPT-5.6 IDs need project access enabled.
        default_model='gpt-4o',
        default_base_url='https://api.openai.com/v1',
        key_envs=('AI_API_KEY', 'OPENAI_API_KEY'),
        model_envs=('AI_MODEL', 'OPENAI_MODEL'),
        token_field='max_tokens',
    ),
    'groq': ProviderSpec(
        name='groq',
        label='Groq',
        default_model='qwen/qwen3.8-27b',
        default_base_url='https://api.groq.com/openai/v1',
        key_envs=('AI_API_KEY', 'GROQ_API_KEY'),
        model_envs=('AI_MODEL',),
        token_field='max_completion_tokens',
        request_extras={'reasoning_effort': 'none'},
    ),
}


@dataclass(frozen=True)
class LlmSettings:
    provider: str
    model: str | None
    accurate_model: str | None
    fast_model: str | None
    route: str
    temperature: float
    api_key: str
    base_url: str
    label: str


def _first_env(*names: str, default: str = '') -> str:
    for name in names:
        value = os.getenv(name, '').strip()
        if value:
            return value
    return default


def resolve_provider_name() -> str:
    raw = _first_env('AI_PROVIDER', 'INTENT_PROVIDER', 'LLM_PROVIDER', default='rules')
    return raw.casefold()


def resolve_settings() -> LlmSettings:
    provider = resolve_provider_name()
    if provider in ('rules', 'ollama'):
        model = os.getenv('OLLAMA_MODEL', 'llama3.2').strip() if provider == 'ollama' else None
        return LlmSettings(
            provider=provider, model=model, accurate_model=model, fast_model=model,
            route='rules', temperature=0.0, api_key='', base_url='', label=provider,
        )
    spec = PROVIDERS.get(provider)
    if spec is None:
        raise ValueError(f'Unsupported AI_PROVIDER: {provider}')
    try:
        temperature = float(os.getenv('AI_MODEL_TEMPERATURE', '0.2'))
        if not math.isfinite(temperature) or not 0 <= temperature <= 2:
            raise ValueError()
    except ValueError as exc:
        raise IntentProviderError('AI_MODEL_TEMPERATURE must be between 0 and 2') from exc
    # Accurate model is the primary AI_MODEL / OPENAI_MODEL. Fast model is optional.
    accurate = _first_env(*spec.model_envs, default='gpt-4o' if provider == 'openai' else spec.default_model)
    fast = _first_env('AI_MODEL_FAST', default='gpt-4o-mini' if provider == 'openai' else accurate)
    route = _first_env('AI_MODEL_ROUTE', default='auto').casefold()
    if route not in ('auto', 'fast', 'accurate'):
        route = 'auto'
    return LlmSettings(
        provider=provider,
        model=accurate,
        accurate_model=accurate,
        fast_model=fast,
        route=route,
        temperature=temperature,
        api_key=_first_env(*spec.key_envs),
        base_url=_first_env('AI_BASE_URL', default=spec.default_base_url).rstrip('/'),
        label=spec.label,
    )


def needs_accurate_model(instruction: str, available_markets: list[dict] | None = None) -> bool:
    """Complex market/language requests use the accurate model; simple mode/count prompts stay fast."""
    text = instruction.casefold()
    if len(instruction) > 220:
        return True
    if available_markets and len(available_markets) >= 8:
        return True
    complex_markers = (
        r'\b(?:draw|draws|handicap|correct score|interval|minute|minutes|btts|double chance|'
        r'over|under|corners?|cards?|league|include|exclude|before|after|tomorrow|tonight|'
        r'weekend|nearest|closest|preserve|original matches only|market)\b'
    )
    if re.search(complex_markers, text):
        return True
    if re.search(r'\b(?:between|around)\s+\d', text) and re.search(r'\b(?:and|team|league|only)\b', text):
        return True
    return False


def select_model(instruction: str, available_markets: list[dict] | None = None, settings: LlmSettings | None = None) -> str:
    settings = settings or resolve_settings()
    accurate = settings.accurate_model or settings.model or 'gpt-4o'
    fast = settings.fast_model or accurate
    if settings.route == 'accurate':
        return accurate
    if settings.route == 'fast':
        return fast
    return accurate if needs_accurate_model(instruction, available_markets) else fast


