"""Dynamic instruction-model orchestrator.

Provider, model, base URL, and credentials are resolved from environment at
request time. Language models only return generation configuration — never
fixtures, booking codes, or wager actions.
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

from app.schemas import Config
from app.prompt import planner_prompt

from .errors import IntentProviderError, GroqIntentError
from .settings import PROVIDERS, resolve_settings, select_model


def strict_schema():
    schema = Config.model_json_schema()

    def visit(node):
        if isinstance(node, dict):
            node.pop('default', None)
            if node.get('type') == 'object':
                node['additionalProperties'] = False
                node['required'] = list(node.get('properties', {}))
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    visit(schema)
    return schema


def _trim_catalog(available_markets: list[dict] | None) -> list[dict]:
    catalog = []
    catalog_size = 0
    for market in (available_markets or []):
        entry = {**market, 'outcomes': market.get('outcomes', [])[:12]}
        size = len(json.dumps(entry, separators=(',', ':')))
        if len(catalog) >= 24 or catalog_size + size > 5000:
            continue
        catalog.append(entry)
        catalog_size += size
    return catalog


def parse_chat_completions(instruction: str, available_markets: list[dict] | None = None, model: str | None = None, prompt_mode: str | None = None) -> Config:
    settings = resolve_settings()
    spec = PROVIDERS.get(settings.provider)
    if spec is None:
        raise ValueError(f'Unsupported AI_PROVIDER: {settings.provider}')
    if spec.requires_key and not settings.api_key:
        raise IntentProviderError(f'AI_API_KEY is required for {spec.label}')
    catalog = _trim_catalog(available_markets)
    output_mode = 'json_schema'
    label = settings.label
    model = model or select_model(instruction, available_markets, settings)
    # Fast model gets a tighter budget/timeout; accurate model may need a bit more for catalogs.
    using_fast = model == settings.fast_model and model != settings.accurate_model
    token_budget = 1024 if using_fast else 1536
    request_timeout = httpx.Timeout(20 if using_fast else 40, connect=8)
    try:
        for attempt in range(6):
            prompt = planner_prompt(instruction, catalog, prompt_mode)
            response_format: dict[str, Any] = {
                'type': 'json_schema',
                'json_schema': {'name': 'generation_config', 'strict': True, 'schema': strict_schema()},
            }
            if output_mode == 'json_object':
                response_format = {'type': 'json_object'}
                prompt += ' Return a JSON object with exactly these fields and valid values: ' + json.dumps(Config.model_json_schema())
            gpt5 = model.casefold().startswith('gpt-5')
            token_field = 'max_completion_tokens' if gpt5 or settings.provider == 'groq' else spec.token_field
            body: dict[str, Any] = {
                'model': model,
                token_field: token_budget,
                'messages': [
                    {'role': 'system', 'content': prompt},
                    {'role': 'user', 'content': instruction},
                ],
                'response_format': response_format,
                **spec.request_extras,
            }
            # GPT-5 / 5.6 reasoning models reject temperature; older chat models still accept it.
            if gpt5:
                body.pop('temperature', None)
                body.setdefault('reasoning_effort', 'none')
            else:
                body['temperature'] = settings.temperature
            response = httpx.post(
                f'{settings.base_url}/chat/completions',
                headers={'Authorization': f'Bearer {settings.api_key}'},
                json=body,
                timeout=request_timeout,
            )
            if response.status_code == 413 and catalog:
                catalog = catalog[: len(catalog) // 2] if attempt < 2 else []
                continue
            if response.status_code == 400 and output_mode == 'json_schema':
                try:
                    invalid_json = response.json().get('error', {}).get('code') == 'json_validate_failed'
                except ValueError:
                    invalid_json = False
                if invalid_json:
                    output_mode = 'json_object'
                    continue
            break
    except httpx.RequestError as exc:
        raise IntentProviderError(f'Could not reach {label}. Please try again.') from exc
    if response.status_code in (401, 403, 404):
        code = None
        try:
            err = response.json().get('error')
            code = err.get('code') if isinstance(err, dict) else None
        except ValueError:
            code = None
        if response.status_code == 401:
            raise IntentProviderError(f'{label} authentication failed. Check AI_API_KEY / OPENAI_API_KEY.')
        if code == 'model_not_found' or response.status_code == 404:
            raise IntentProviderError(
                f'{label} model {model} is not enabled for this API project. '
                f'Set AI_MODEL / AI_MODEL_FAST to a model your project allows, or enable it in the OpenAI project settings.'
            )
        raise IntentProviderError(f'{label} authentication or model access failed. Check the AI credentials and model permissions.')
    if response.status_code == 429:
        raise IntentProviderError(f'{label} rate limit reached. Please try again shortly.')
    if response.status_code == 413:
        raise IntentProviderError(f'{label} cannot accept this request size. Shorten the instructions or use a model with a larger account token limit.')
    if not response.is_success:
        raise IntentProviderError(f'{label} request failed (HTTP {response.status_code}). Check AI model configuration.')
    try:
        choice = response.json()['choices'][0]
        if choice['message'].get('refusal'):
            raise ValueError('Incomplete or refused response')
        if choice.get('finish_reason') not in (None, 'stop', 'length'):
            raise ValueError('Incomplete or refused response')
        content = choice['message'].get('content')
        if not content:
            raise ValueError('Incomplete or refused response')
        data = json.loads(content)
        if not isinstance(data, dict) or set(Config.model_fields) - set(data):
            raise ValueError('Model omitted required configuration fields')
        return Config.model_validate(data)
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise IntentProviderError(f'{label} returned an invalid or incomplete generation configuration. Please try again.') from exc


def parse_groq(instruction: str, available_markets: list[dict] | None = None) -> Config:
    """Compatibility wrapper; prefer parse_chat_completions with AI_PROVIDER set."""
    return parse_chat_completions(instruction, available_markets)


def health_intent_fields() -> dict[str, Any]:
    settings = resolve_settings()
    return {
        'intentProvider': settings.provider,
        'intentModel': settings.accurate_model,
        'intentModelFast': settings.fast_model,
        'intentModelRoute': settings.route,
        'intentBaseUrl': settings.base_url or None,
    }


def parse_ollama(instruction: str, available_markets: list[dict] | None = None, prompt_mode: str | None = None) -> Config:
    response = httpx.post(
        os.getenv('OLLAMA_URL', 'http://host.docker.internal:11434') + '/api/chat',
        json={'model': os.getenv('OLLAMA_MODEL', 'llama3.2'), 'stream': False,
              'format': Config.model_json_schema(),
              'messages': [{'role': 'system', 'content': planner_prompt(instruction, _trim_catalog(available_markets), prompt_mode)},
                           {'role': 'user', 'content': instruction}], 'options': {'temperature': 0}},
        timeout=90,
    )
    response.raise_for_status()
    return Config.model_validate(json.loads(response.json()['message']['content']))
