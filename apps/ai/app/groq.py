"""Compatibility shim. Prefer app.llm for the dynamic instruction-model orchestrator."""
from .llm import GroqIntentError, IntentProviderError, parse_chat_completions, parse_groq, strict_schema

__all__ = ['GroqIntentError', 'IntentProviderError', 'parse_chat_completions', 'parse_groq', 'strict_schema']
