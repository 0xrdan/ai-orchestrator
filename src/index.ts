/**
 * AI Orchestrator - Multi-model LLM routing with Claude-first architecture
 *
 * A production-ready framework for intelligent query routing across multiple
 * LLM providers (Claude, GPT, Gemini) with automatic fallbacks and
 * complexity-based model selection.
 *
 * @packageDocumentation
 */

// Model Registry
export {
  // Types
  Provider,
  ModelTier,
  RouteType,
  ModelConfig,
  EmbeddingModelConfig,
  RouteConfig,
  // Constants
  MODELS,
  EMBEDDING_MODELS,
  ROUTE_CONFIGS,
  SPECIALIZED_MODELS,
  COST_OPTIMIZATIONS,
  // Functions
  getModel,
  getModelId,
  getModelsByProvider,
  getModelsByTier,
  getRouteConfig,
  getRouteModel,
  getRouteFallbacks,
  estimateCost,
  getEmbeddingModel,
  getSpecializedModel,
  modelSupportsFeature,
  getCheapestModel,
  // Singleton
  modelRegistry,
} from './model-registry';

// Providers
export {
  // Types
  Message,
  ChatOptions,
  ChatResult,
  AIProvider,
  ProviderManagerOptions,
  // Classes
  AnthropicProvider,
  OpenAIProvider,
  GeminiProvider,
  ProviderManager,
  // Factory
  createProviderManager,
} from './providers';

// Router
export {
  // Types
  RouterInput,
  RouterDecision,
  RouterStats,
  RouterConfig,
  // Class
  IntelligentRouter,
  // Factory functions
  getRouter,
  createRouter,
} from './router';

// Executor
export {
  // Types
  ExecutionContext,
  ExecutionResult,
  ExecutorConfig,
  // Classes
  TimingTracker,
  RouteExecutor,
  // Factory
  createExecutor,
} from './executor';

// =============================================================================
// Convenience: All-in-one Orchestrator
// =============================================================================

import { IntelligentRouter, RouterConfig, RouterDecision } from './router';
import { RouteExecutor, ExecutorConfig, ExecutionContext, ExecutionResult } from './executor';
import { ProviderManager, ProviderManagerOptions } from './providers';
import { RouteType } from './model-registry';

export interface OrchestratorConfig {
  router?: RouterConfig;
  executor?: ExecutorConfig;
  providers?: ProviderManagerOptions;
}

/**
 * AI Orchestrator - High-level interface for query routing and execution
 *
 * @example
 * ```typescript
 * const orchestrator = new Orchestrator();
 *
 * const result = await orchestrator.process({
 *   query: "What are the key differences between React and Vue?",
 *   mode: 'standard',
 * });
 *
 * console.log(result.answer);
 * console.log(`Route: ${result.route}, Model: ${result.model}`);
 * ```
 */
export class Orchestrator {
  private router: IntelligentRouter;
  private executor: RouteExecutor;
  private providerManager: ProviderManager;

  constructor(config?: OrchestratorConfig) {
    this.providerManager = new ProviderManager(config?.providers);
    this.router = new IntelligentRouter(config?.router);
    this.executor = new RouteExecutor({
      ...config?.executor,
      providerManager: this.providerManager,
    });
  }

  /**
   * Process a query through routing and execution
   */
  async process(context: ExecutionContext): Promise<ExecutionResult> {
    // Route the query
    const routerDecision = await this.router.route({
      query: context.query,
      mode: context.mode,
      conversationHistory: context.conversationHistory,
    });

    // Execute through the selected route
    return this.executor.execute(routerDecision.route, {
      ...context,
      routerDecision,
    });
  }

  /**
   * Process with a specific route (bypass routing)
   */
  async processWithRoute(
    route: RouteType,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    return this.executor.execute(route, context);
  }

  /**
   * Get the router instance for direct access
   */
  getRouter(): IntelligentRouter {
    return this.router;
  }

  /**
   * Get the executor instance for direct access
   */
  getExecutor(): RouteExecutor {
    return this.executor;
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return this.router.getStats();
  }

  /**
   * Check if the orchestrator is ready (has available providers)
   */
  isReady(): boolean {
    return this.providerManager.isAvailable();
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return this.providerManager.getAvailableProviders();
  }
}

/**
 * Create an orchestrator instance
 */
export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}

export default Orchestrator;
