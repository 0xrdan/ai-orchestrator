# AI Orchestrator

Multi-model LLM routing with Claude-first architecture and intelligent fallbacks.

> *This is a standalone extraction from my production portfolio site. See it in action at [danmonteiro.com](https://www.danmonteiro.com).*

---

## The Problem

You're building with multiple LLMs but:

- **Hardcoding provider logic** — switching models means rewriting code
- **No graceful degradation** — when Claude is rate-limited, your app breaks
- **Wasting money** — paying Opus prices for "what's the weather?" queries
- **Complexity sprawl** — different APIs, response formats, error handling for each provider

## The Solution

AI Orchestrator provides:

- **One interface, any provider** — Claude, GPT, and Gemini behind a unified API
- **Intelligent routing** — queries are classified and sent to the optimal model
- **Automatic fallbacks** — provider failures trigger seamless failover
- **Cost optimization** — simple queries use cheap/fast models, complex ones use flagship

```typescript
import { Orchestrator } from 'ai-orchestrator';

const orchestrator = new Orchestrator();

const result = await orchestrator.process({
  query: "Compare microservices vs monolith architectures",
  mode: 'standard',
});

console.log(result.answer);     // Detailed comparison
console.log(result.route);      // 'deep' (auto-detected complexity)
console.log(result.model);      // 'claude-opus-4-...'
console.log(result.costs);      // { estimated: 0.0045, inputTokens: 1200, ... }
```

## Results

From production usage on my portfolio site:

| Metric | Before | After |
|--------|--------|-------|
| Cost per query (avg) | $0.012 | $0.004 |
| Provider downtime impact | Full outage | Zero (fallback) |
| Simple query latency | 2.1s | 0.8s |

---

## Design Philosophy

### Why Claude-First?

This isn't arbitrary vendor preference—it's an intentional architectural choice:

1. **Quality-cost balance**: Claude Sonnet is the primary workhorse. Best reasoning per dollar for typical queries. Not the cheapest, not the most expensive—the sweet spot.

2. **Tiered complexity**: Haiku handles fast/cheap auxiliary tasks (routing, reranking, classification). Opus is reserved for genuinely complex analysis. You don't bring a sledgehammer to hang a picture.

3. **Ecosystem alignment**: Building on Claude means access to extended thinking, tool use, and MCP compatibility as the ecosystem evolves.

4. **Fallback resilience**: GPT and Gemini act as safety nets, not primary choices. When Claude is unavailable, your app keeps working.

### Route Architecture

```
Query → Router (Haiku) → Route Selection → Execution → Response
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
    Fast Route           Standard Route        Deep Route
   (GPT-4o-mini)        (Claude Sonnet)       (Claude Opus)
        ↓                     ↓                     ↓
   Simple facts          Synthesis            Complex analysis
```

The router itself uses Claude Haiku—fast and cheap for classification. This adds ~100ms of latency but saves significant cost by avoiding Opus calls for simple questions.

---

## Quick Start

### 1. Install

```bash
npm install ai-orchestrator
```

### 2. Configure API Keys

```bash
# Required: At least one provider
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional: Fallback providers
export OPENAI_API_KEY="sk-..."
export GOOGLE_AI_API_KEY="..."
```

### 3. Use

```typescript
import { Orchestrator } from 'ai-orchestrator';

const orchestrator = new Orchestrator();

// Automatic routing
const result = await orchestrator.process({
  query: "What is TypeScript?",
});
// → Uses 'fast' route (GPT-4o-mini)

// Force a specific route
const deepResult = await orchestrator.processWithRoute('deep', {
  query: "Analyze the trade-offs between SQL and NoSQL databases",
});
// → Uses 'deep' route (Claude Opus)
```

---

## API Reference

### Orchestrator

The main entry point for query processing.

```typescript
const orchestrator = new Orchestrator({
  // Optional: Custom provider order
  providers: {
    providerOrder: ['anthropic', 'openai', 'google'],
  },
  // Optional: Custom router configuration
  router: {
    complexSignals: ['analyze', 'compare', 'explain why'],
  },
});
```

#### Methods

| Method | Description |
|--------|-------------|
| `process(context)` | Route and execute a query automatically |
| `processWithRoute(route, context)` | Execute with a specific route |
| `getStats()` | Get routing statistics |
| `getAvailableProviders()` | List configured providers |

### Routes

| Route | Primary Model | Use Case |
|-------|---------------|----------|
| `fast` | GPT-4o-mini | Simple factual questions |
| `standard` | Claude Sonnet | Balanced quality/speed |
| `deep` | Claude Opus | Complex analysis |
| `creative` | Claude Sonnet | Brainstorming, exploration |
| `research` | Gemini 1.5 Pro | Long context research |

### Model Registry

Access model configurations directly:

```typescript
import { getModel, estimateCost, getCheapestModel } from 'ai-orchestrator';

const sonnet = getModel('claude-sonnet-4');
console.log(sonnet.inputCost);  // 3.00 per 1M tokens

const cost = estimateCost('claude-sonnet-4', 1000, 500);
console.log(cost);  // Estimated cost in USD

const cheapest = getCheapestModel({ minContextWindow: 100000 });
console.log(cheapest.id);  // 'gemini-1.5-flash'
```

---

## Advanced Usage

### Custom System Prompts

```typescript
const orchestrator = new Orchestrator({
  executor: {
    systemPrompts: {
      standard: `You are a helpful coding assistant...`,
      deep: `You are an expert software architect...`,
    },
  },
});
```

### Direct Provider Access

```typescript
import { ProviderManager } from 'ai-orchestrator';

const providers = new ProviderManager({
  providerOrder: ['anthropic', 'openai'],
});

const result = await providers.chat(
  [{ role: 'user', content: 'Hello!' }],
  'You are a helpful assistant.',
  { temperature: 0.7 }
);
```

### Router Only

```typescript
import { IntelligentRouter } from 'ai-orchestrator';

const router = new IntelligentRouter();

const decision = await router.route({
  query: "What are the implications of quantum computing for cryptography?",
});

console.log(decision.route);      // 'deep'
console.log(decision.confidence); // 0.92
console.log(decision.reasoning);  // 'Query contains complexity signals'
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Claude API key |
| `OPENAI_API_KEY` | No | GPT API key (fallback) |
| `GOOGLE_AI_API_KEY` | No | Gemini API key (fallback) |

*At least one provider key is required.

### Customizing Models

Override default models per provider:

```typescript
const orchestrator = new Orchestrator({
  providers: {
    providerConfigs: {
      anthropic: {
        primaryModel: 'claude-3-5-sonnet-20241022',
        fallbackModel: 'claude-3-haiku-20240307',
      },
    },
  },
});
```

---

## Project Structure

```
ai-orchestrator/
├── src/
│   ├── index.ts          # Main exports + Orchestrator class
│   ├── model-registry.ts # Model configs, pricing, routes
│   ├── providers.ts      # Claude, GPT, Gemini providers
│   ├── router.ts         # Intelligent query routing
│   └── executor.ts       # Route execution framework
├── examples/
│   └── basic-usage.ts
├── docs/
│   └── architecture.md
└── README.md
```

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/add-new-provider`)
3. Make changes with semantic commits
4. Open a PR with clear description

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

Built with [Claude Code](https://claude.ai/code).

```
Co-Authored-By: Claude <noreply@anthropic.com>
```
