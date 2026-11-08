class IntentProviderError(RuntimeError):
    """Sanitized failure safe to expose at the HTTP boundary."""


GroqIntentError = IntentProviderError
