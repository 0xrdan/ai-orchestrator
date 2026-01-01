/**
 * Model Registry - Central configuration for all AI models
 *
 * This module provides a unified registry of AI models across providers,
 * including pricing, capabilities, and recommended usage patterns.
 *
 * @module model-registry
 */

// =============================================================================
// Types
// =============================================================================

export type Provider = 'anthropic' | 'openai' | 'google';
export type ModelTier = 'flagship' | 'balanced' | 'fast' | 'budget';
export type RouteType = 'fast' | 'standard' | 'deep' | 'creative' | 'research';

export interface ModelConfig {
  id: string;                    // Specific model version ID
  alias?: string;                // Auto-updating alias (if available)
  provider: Provider;
  tier: ModelTier;
  contextWindow: number;         // Max context in tokens
  maxOutput: number;             // Max output tokens
  inputCost: number;             // Cost per 1M input tokens (USD)
  outputCost: number;            // Cost per 1M output tokens (USD)
  features?: string[];           // Special features supported
  notes?: string;                // Usage recommendations
}

export interface EmbeddingModelConfig {
  id: string;
  provider: Provider;
  dimensions: number;
  costPer1M: number;             // Cost per 1M tokens
  notes?: string;
}

export interface RouteConfig {
  name: RouteType;
  description: string;
  primaryModel: string;          // Model key from MODELS
  fallbackChain: string[];       // Ordered fallback model keys
  reranking: boolean;
  temperature: number;
  maxTokens: number;
  retrievalConfig: {
    strategy: 'basic' | 'reranked' | 'multi-query';
    topK: number;
    threshold: number;
  };
}

// =============================================================================
// Model Registry
// =============================================================================

export const MODELS: Record<string, ModelConfig> = {
  // ---------------------------------------------------------------------------
  // Anthropic Models (Claude-first architecture)
  // ---------------------------------------------------------------------------
  'claude-opus-4': {
    id: 'claude-opus-4-20250514',
    alias: 'claude-opus-4-latest',
    provider: 'anthropic',
    tier: 'flagship',
    contextWindow: 200000,
    maxOutput: 32000,
    inputCost: 15.00,
    outputCost: 75.00,
    features: ['extended_thinking', 'vision', 'tool_use'],
    notes: 'Best reasoning. Reserve for complex queries requiring deep analysis.',
  },
  'claude-sonnet-4': {
    id: 'claude-sonnet-4-20250514',
    alias: 'claude-sonnet-4-latest',
    provider: 'anthropic',
    tier: 'balanced',
    contextWindow: 200000,
    maxOutput: 16000,
    inputCost: 3.00,
    outputCost: 15.00,
    features: ['extended_thinking', 'vision', 'tool_use'],
    notes: 'Best quality/cost ratio. PRIMARY choice for Standard & Deep routes.',
  },
  'claude-haiku-3.5': {
    id: 'claude-3-5-haiku-20241022',
    alias: 'claude-3-5-haiku-latest',
    provider: 'anthropic',
    tier: 'fast',
    contextWindow: 200000,
    maxOutput: 8192,
    inputCost: 0.80,
    outputCost: 4.00,
    features: ['vision', 'tool_use'],
    notes: 'Fast & cheap. Use for routing, reranking, classification.',
  },

  // ---------------------------------------------------------------------------
  // OpenAI Models (Fallback tier)
  // ---------------------------------------------------------------------------
  'gpt-4o': {
    id: 'gpt-4o',
    provider: 'openai',
    tier: 'balanced',
    contextWindow: 128000,
    maxOutput: 16384,
    inputCost: 2.50,
    outputCost: 10.00,
    features: ['json_mode', 'vision', 'function_calling'],
    notes: 'Strong fallback for Claude Sonnet.',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    provider: 'openai',
    tier: 'fast',
    contextWindow: 128000,
    maxOutput: 16384,
    inputCost: 0.15,
    outputCost: 0.60,
    features: ['json_mode', 'vision', 'function_calling'],
    notes: 'Cheapest option - use for Fast route.',
  },

  // ---------------------------------------------------------------------------
  // Google Gemini Models (Fallback tier)
  // ---------------------------------------------------------------------------
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    provider: 'google',
    tier: 'balanced',
    contextWindow: 2000000,
    maxOutput: 8192,
    inputCost: 1.25,
    outputCost: 5.00,
    features: ['vision'],
    notes: '2M context - ideal for long document processing.',
  },
  'gemini-1.5-flash': {
    id: 'gemini-1.5-flash',
    provider: 'google',
    tier: 'fast',
    contextWindow: 1000000,
    maxOutput: 8192,
    inputCost: 0.075,
    outputCost: 0.30,
    features: ['vision'],
    notes: 'Budget option with large context.',
  },
};

// =============================================================================
// Embedding Models
// =============================================================================

export const EMBEDDING_MODELS: Record<string, EmbeddingModelConfig> = {
  'text-embedding-3-large': {
    id: 'text-embedding-3-large',
    provider: 'openai',
    dimensions: 3072,
    costPer1M: 0.13,
    notes: 'Best accuracy. Use for production.',
  },
  'text-embedding-3-small': {
    id: 'text-embedding-3-small',
    provider: 'openai',
    dimensions: 1536,
    costPer1M: 0.02,
    notes: 'Budget option. Good for testing.',
  },
};

// =============================================================================
// Route Configurations (Claude-first with fallbacks)
// =============================================================================

export const ROUTE_CONFIGS: Record<RouteType, RouteConfig> = {
  fast: {
    name: 'fast',
    description: 'Quick responses to simple, factual queries',
    primaryModel: 'gpt-4o-mini',           // Cheapest for simple queries
    fallbackChain: ['gemini-1.5-flash', 'claude-haiku-3.5'],
    reranking: false,
    temperature: 0.3,
    maxTokens: 500,
    retrievalConfig: {
      strategy: 'basic',
      topK: 5,
      threshold: 0.45,
    },
  },
  standard: {
    name: 'standard',
    description: 'Balanced quality/speed for typical queries',
    primaryModel: 'claude-sonnet-4',       // Claude-first for quality
    fallbackChain: ['gpt-4o', 'gemini-1.5-pro'],
    reranking: true,
    temperature: 0.5,
    maxTokens: 800,
    retrievalConfig: {
      strategy: 'reranked',
      topK: 5,
      threshold: 0.5,
    },
  },
  deep: {
    name: 'deep',
    description: 'Complex analysis requiring multi-step reasoning',
    primaryModel: 'claude-opus-4',         // Best reasoning for complex
    fallbackChain: ['claude-sonnet-4', 'gpt-4o'],
    reranking: true,
    temperature: 0.6,
    maxTokens: 1500,
    retrievalConfig: {
      strategy: 'multi-query',
      topK: 8,
      threshold: 0.45,
    },
  },
  creative: {
    name: 'creative',
    description: 'Open-ended exploration and brainstorming',
    primaryModel: 'claude-sonnet-4',       // Good creativity/cost balance
    fallbackChain: ['gpt-4o', 'gemini-1.5-pro'],
    reranking: false,
    temperature: 0.8,
    maxTokens: 1000,
    retrievalConfig: {
      strategy: 'basic',
      topK: 5,
      threshold: 0.4,
    },
  },
  research: {
    name: 'research',
    description: 'Deep research queries requiring extensive context',
    primaryModel: 'gemini-1.5-pro',        // 2M context for research
    fallbackChain: ['claude-sonnet-4', 'gpt-4o'],
    reranking: true,
    temperature: 0.6,
    maxTokens: 1500,
    retrievalConfig: {
      strategy: 'reranked',
      topK: 5,
      threshold: 0.5,
    },
  },
};

// =============================================================================
// Specialized Model Assignments
// =============================================================================

export const SPECIALIZED_MODELS = {
  // Fast, cheap models for auxiliary tasks
  router: 'claude-haiku-3.5',
  reranker: 'claude-haiku-3.5',
  conceptExtractor: 'claude-haiku-3.5',
  queryExpander: 'claude-haiku-3.5',
  complexityAssessor: 'claude-haiku-3.5',

  // Context handling
  contextCompressor: 'gemini-1.5-pro',     // Large context window

  // Embeddings
  embedding: 'text-embedding-3-large',
  embeddingFallback: 'text-embedding-3-small',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a model configuration by key
 */
export function getModel(modelKey: string): ModelConfig | undefined {
  return MODELS[modelKey];
}

/**
 * Get the actual model ID (resolves aliases if configured)
 */
export function getModelId(modelKey: string, useAlias: boolean = false): string {
  const model = MODELS[modelKey];
  if (!model) {
    throw new Error(`Unknown model: ${modelKey}`);
  }
  return useAlias && model.alias ? model.alias : model.id;
}

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(provider: Provider): ModelConfig[] {
  return Object.values(MODELS).filter(m => m.provider === provider);
}

/**
 * Get all models of a specific tier
 */
export function getModelsByTier(tier: ModelTier): ModelConfig[] {
  return Object.values(MODELS).filter(m => m.tier === tier);
}

/**
 * Get the route configuration
 */
export function getRouteConfig(route: RouteType): RouteConfig {
  return ROUTE_CONFIGS[route];
}

/**
 * Get the primary model for a route
 */
export function getRouteModel(route: RouteType): ModelConfig {
  const routeConfig = ROUTE_CONFIGS[route];
  const model = MODELS[routeConfig.primaryModel];
  if (!model) {
    throw new Error(`Invalid primary model for route ${route}: ${routeConfig.primaryModel}`);
  }
  return model;
}

/**
 * Get fallback models for a route
 */
export function getRouteFallbacks(route: RouteType): ModelConfig[] {
  const routeConfig = ROUTE_CONFIGS[route];
  return routeConfig.fallbackChain
    .map(key => MODELS[key])
    .filter((m): m is ModelConfig => m !== undefined);
}

/**
 * Calculate estimated cost for a request
 */
export function estimateCost(
  modelKey: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = MODELS[modelKey];
  if (!model) {
    throw new Error(`Unknown model: ${modelKey}`);
  }

  const inputCost = (inputTokens / 1_000_000) * model.inputCost;
  const outputCost = (outputTokens / 1_000_000) * model.outputCost;

  return inputCost + outputCost;
}

/**
 * Get the embedding model configuration
 */
export function getEmbeddingModel(primary: boolean = true): EmbeddingModelConfig {
  const key = primary ? SPECIALIZED_MODELS.embedding : SPECIALIZED_MODELS.embeddingFallback;
  return EMBEDDING_MODELS[key];
}

/**
 * Get specialized model for a specific task
 */
export function getSpecializedModel(
  task: keyof typeof SPECIALIZED_MODELS
): ModelConfig | EmbeddingModelConfig {
  const modelKey = SPECIALIZED_MODELS[task];

  // Check if it's an embedding model
  if (modelKey.startsWith('text-embedding')) {
    return EMBEDDING_MODELS[modelKey];
  }

  const model = MODELS[modelKey];
  if (!model) {
    throw new Error(`Unknown specialized model for ${task}: ${modelKey}`);
  }
  return model;
}

/**
 * Check if a model supports a specific feature
 */
export function modelSupportsFeature(modelKey: string, feature: string): boolean {
  const model = MODELS[modelKey];
  return model?.features?.includes(feature) ?? false;
}

/**
 * Get the cheapest model that meets minimum requirements
 */
export function getCheapestModel(options: {
  minContextWindow?: number;
  provider?: Provider;
  tier?: ModelTier;
}): ModelConfig | undefined {
  let candidates = Object.values(MODELS);

  if (options.provider) {
    candidates = candidates.filter(m => m.provider === options.provider);
  }
  if (options.tier) {
    candidates = candidates.filter(m => m.tier === options.tier);
  }
  if (options.minContextWindow) {
    candidates = candidates.filter(m => m.contextWindow >= options.minContextWindow);
  }

  // Sort by total cost (input + output, assuming equal usage)
  candidates.sort((a, b) => (a.inputCost + a.outputCost) - (b.inputCost + b.outputCost));

  return candidates[0];
}

// =============================================================================
// Cost Optimization Helpers
// =============================================================================

export const COST_OPTIMIZATIONS = {
  batchAPI: {
    discount: 0.50,
    description: '50% off for batch processing (24h turnaround)',
  },
  promptCaching: {
    discount: 0.90,
    description: 'Up to 90% off for cached prompts',
  },
};

// =============================================================================
// Registry Singleton
// =============================================================================

class ModelRegistry {
  private static instance: ModelRegistry;

  private constructor() {}

  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  getModel = getModel;
  getModelId = getModelId;
  getModelsByProvider = getModelsByProvider;
  getModelsByTier = getModelsByTier;
  getRouteConfig = getRouteConfig;
  getRouteModel = getRouteModel;
  getRouteFallbacks = getRouteFallbacks;
  estimateCost = estimateCost;
  getEmbeddingModel = getEmbeddingModel;
  getSpecializedModel = getSpecializedModel;
  modelSupportsFeature = modelSupportsFeature;
  getCheapestModel = getCheapestModel;

  // Expose raw data for iteration
  get models() { return MODELS; }
  get embeddingModels() { return EMBEDDING_MODELS; }
  get routeConfigs() { return ROUTE_CONFIGS; }
  get specializedModels() { return SPECIALIZED_MODELS; }
}

export const modelRegistry = ModelRegistry.getInstance();
export default modelRegistry;
