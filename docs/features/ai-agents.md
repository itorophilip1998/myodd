# AI agents and folder ownership

The AI service keeps the existing `api`, `agents`, `prompt`, `llms`, `memory`, and `tools` folders. `main.py` only creates the app, loads the configured scoring model, and manages the process pool. `schemas.py` owns shared request and result models; `train.py` remains the standalone model-training command.

| Folder | Responsibility |
| --- | --- |
| `apps/ai/app/api/` | FastAPI routes, request validation, sanitized HTTP errors, and response formatting. |
| `apps/ai/app/agents/` | Four mode wrappers and a prediction wrapper; compose the tools into each request workflow. The registry selects the agent from `riskMode`. |
| `apps/ai/app/prompt/` | Editable text prompts: shared constraints plus separate Investor, Gambler, Japa, Lagos Life, prediction, and split instructions. |
| `apps/ai/app/llms/` | Reusable OpenAI/Groq/Ollama clients, environment settings, model routing, provider errors, and odds/Poisson scoring models. No embedded system prompts. |
| `apps/ai/app/memory/` | Short-lived intent/result caches and application of saved preferences. Account-scoped preferences/history live in API/PostgreSQL. Accepted calibration artifacts and evaluation metadata are persisted on the AI data volume; see [learning](learning.md). |
| `apps/ai/app/tools/` | Reusable intent parsing, catalog resolution, selection validation, ticket search, reporting, recent results, team trends, discovery, scoring execution, and exact ticket splitting. |

## Agent routes and tools

| Route | Agent | Tools and policy |
| --- | --- | --- |
| `POST /generate/investor` | `InvestorAgent` | Scoring → recent goal trends → accepted calibration → constrained search/report; ticket odds 3–6, legs 1.10–1.35. The explicit Investor system plan remains 3 near 3, 3 near 4, 2 near 5, and 2 near 6. |
| `POST /generate/gambler` | `GamblerAgent` | Scoring → recent goal trends → accepted calibration → constrained search/report; mixed ticket odds 6.1–20, legs 1.10–1.35. |
| `POST /generate/japa` | `JapaAgent` | Scoring → accepted calibration → constrained search/report; ticket odds 20.01–100, legs 1.10–2.00. |
| `POST /generate/lagos-life` | `LagosLifeAgent` | Scoring → accepted calibration → constrained search/report; ticket odds from 100 with no default ceiling, legs 1.10–2.00. |
| `POST /generate/prediction` | `PredictionAgent` | Shared scoring model plus accepted calibration; returns scored live-market selections without constructing tickets. |
| `POST /tools/split` | Selected mode wrapper | Scoring → `tools/splitting.py`; partition available original picks exactly once, with no replacements or trend-driven generation. |

Generation requests retain `{ fixtures, config, originalSelections?, expandedSearch? }`. Prediction requests take `{ fixtures }`; split requests add `parts` to the generation shape. Existing response fields are preserved.

The Node `AiClient` selects the generation URL from `config.riskMode`; prediction and split calls use their dedicated endpoints. `/intent` selects a planning agent from the final named mode or saved mode, and defaults to Investor. Investor/Gambler Create requests bypass this intent endpoint and build fixed configuration locally for speed. They score only the provided 19 options found on the day’s listing. Other planning requests receive shared rules plus only that agent's mode prompt. Split instructions additionally load the split prompt. Both hosted providers and Ollama use this prompt composition. Local rules remain available with the same validated fallback behavior.

Mode routes reject conflicting `riskMode` values. Investor and Gambler generation uses internal counts, games, markets and full-band odds targets; typed, saved and crafted overrides do not replace that plan. Japa and Lagos Life retain explicit narrower bounds. The exclusive Investor/Gambler list and mixed-target allocation are documented in [system modes](investor-system-mode.md). Market and per-leg checks remain server-enforced even when a provider returns an invalid plan.

`POST /generate` still dispatches by `config.riskMode`; an unlabelled numeric request keeps its existing custom constraints. `/split` and `/predictions` are aliases for the same split/prediction workflows. This allows older callers to continue working.

## Debugging and extension

Edit mode wording in `prompt/<mode>.txt`, provider/model selection in `llms/settings.py`, or the relevant tool implementation. Shared policy enforcement lives in `tools/risk_modes.py` and `tools/odds_policy.py`; prompts do not replace those checks. Generation reporting, bounded combination search, and selection filters are separate files so each can be inspected independently.

No orchestration framework or additional provider dependency is required. Agents are explicit Python wrappers around the current models and tools. Predictions remain numerical model output; a language model does not invent probabilities. Old flat modules and the obsolete Groq shim have been removed; internal imports now point directly to their owning folders.

Run checks from the repository root:

```sh
PYTHONPATH=apps/ai apps/ai/.venv/bin/python -m unittest discover -s apps/ai/tests -q
pnpm --filter @myodd/api exec vitest run
pnpm --filter @myodd/api exec tsc -p tsconfig.json --noEmit
```
