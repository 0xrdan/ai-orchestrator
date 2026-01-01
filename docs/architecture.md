# Architecture

This document describes the internal architecture of AI Orchestrator.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Orchestrator                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Router    │───▶│  Executor   │───▶│  Provider Manager   │ │
│  │  (Haiku)    │    │             │    │                     │ │
│  └─────────────┘    └─────────────┘    │  ┌───────────────┐  │ │
│        │                   │            │  │   Anthropic   │  │ │
│        ▼                   ▼            │  ├───────────────┤  │ │
│  ┌─────────────┐    ┌─────────────┐    │  │    OpenAI     │  │ │
│  │   Model     │    │   System    │    │  ├───────────────┤  │ │
│  │  Registry   │    │   Prompts   │    │  │    Gemini     │  │ │
│  └─────────────┘    └─────────────┘    │  └───────────────┘  │ │
│                                         └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Model Registry (`model-registry.ts`)

Central configuration for all AI models.

**Responsibilities:**
- Store model configurations (IDs, pricing, capabilities)
- Define route configurations
- Provide helper functions for model selection

**Key Data Structures:**
- `MODELS`: Record of all available models
- `ROUTE_CONFIGS`: Route definitions with primary/fallback models
- `SPECIALIZED_MODELS`: Assignments for auxiliary tasks

### Providers (`providers.ts`)

Unified interface across LLM providers.

**Classes:**
- `AnthropicProvider`: Claude integration
- `OpenAIProvider`: GPT integration
- `GeminiProvider`: Gemini integration
- `ProviderManager`: Orchestrates provider fallback chain

**Key Features:**
- Consistent `chat()` interface across providers
- Automatic retry with fallback models
- Token usage tracking

### Router (`router.ts`)

Intelligent query classification and route selection.

**Approach:**
1. Check for bypass conditions (very simple queries)
2. Use LLM (Haiku) for classification if available
3. Fall back to heuristic routing if LLM unavailable

**Signals Detected:**
- Complexity signals: "compare", "analyze", "trade-offs"
- Research signals: "methodology", "findings", "evidence"
- Creative signals: "imagine", "possibilities", "brainstorm"

### Executor (`executor.ts`)

Route execution framework.

**Responsibilities:**
- Build conversation messages
- Apply route-specific system prompts
- Track timing and costs
- Handle execution errors

## Data Flow

1. **Query Arrival**
   ```
   User Query → Orchestrator.process()
   ```

2. **Routing Phase**
   ```
   Query → Router.route() → RouterDecision { route, confidence }
   ```

3. **Execution Phase**
   ```
   RouterDecision → Executor.execute() → ProviderManager.chat()
   ```

4. **Response**
   ```
   ChatResult → ExecutionResult { answer, route, model, costs }
   ```

## Cost Optimization Strategy

### Route Selection Logic

| Query Characteristics | Selected Route | Primary Model | Why |
|----------------------|----------------|---------------|-----|
| < 5 words, simple pattern | fast | GPT-4o-mini | Cheapest, fastest |
| Standard complexity | standard | Claude Sonnet | Best quality/cost |
| Contains complexity signals | deep | Claude Opus | Best reasoning |
| Exploratory language | creative | Claude Sonnet | Good creativity/cost |
| Research mode + long context | research | Gemini 1.5 Pro | 2M context |

### Fallback Strategy

```
Primary Failed?
    ↓ Yes
Try Fallback 1
    ↓ Failed
Try Fallback 2
    ↓ Failed
Throw Error
```

Each route has a defined fallback chain. Example for `standard`:
1. Claude Sonnet (primary)
2. GPT-4o (fallback 1)
3. Gemini 1.5 Pro (fallback 2)

## Extending the System

### Adding a New Provider

1. Implement `AIProvider` interface
2. Add to `ProviderManager` initialization
3. Add models to `MODELS` registry

### Adding a New Route

1. Add route type to `RouteType`
2. Define `RouteConfig` in `ROUTE_CONFIGS`
3. Add system prompt in `Executor`
4. Update router signals if needed

### Custom Routing Logic

Override default signals:

```typescript
const router = new IntelligentRouter({
  complexSignals: ['my-custom', 'signals'],
  simplePatterns: [/^custom pattern/i],
});
```
