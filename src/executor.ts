/**
 * Route Executor - Execution framework for different query routes
 *
 * This module provides the base execution framework for processing
 * queries through different routes (fast, standard, deep, creative, research).
 *
 * @module executor
 */

import {
  RouteType,
  RouteConfig,
  ModelConfig,
  getRouteConfig,
  getRouteModel,
  getRouteFallbacks,
  estimateCost,
} from './model-registry';
import { RouterDecision } from './router';
import { ProviderManager, ChatOptions, ChatResult } from './providers';

// =============================================================================
// Types
// =============================================================================

export interface ExecutionContext {
  query: string;
  mode?: 'research' | 'standard';
  routerDecision?: RouterDecision;
  systemPrompt?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  retrievedContext?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  answer: string;
  route: RouteType;
  model: string;
  provider: string;
  confidence: number;
  timing: {
    totalMs: number;
    routingMs?: number;
    generationMs: number;
  };
  costs: {
    estimated: number;
    inputTokens: number;
    outputTokens: number;
  };
  metadata: {
    fallbackUsed: boolean;
    fallbackReason?: string;
    routerBypassed?: boolean;
  };
}

export interface ExecutorConfig {
  /** Custom system prompts for each route */
  systemPrompts?: Partial<Record<RouteType, string>>;
  /** Provider manager instance (optional, will create if not provided) */
  providerManager?: ProviderManager;
}

// =============================================================================
// Default System Prompts
// =============================================================================

const DEFAULT_SYSTEM_PROMPTS: Record<RouteType, string> = {
  fast: `You are a helpful AI assistant. Provide quick, direct answers to simple questions.
Be concise and factual. Use the provided context to answer accurately.
Format responses with markdown when helpful.`,

  standard: `You are a helpful AI assistant. Provide balanced, well-structured responses.
Your answers should be:
- Clear and informative
- Based on provided context
- Under 200 words unless more detail is needed
Use markdown formatting for readability.`,

  deep: `You are an AI assistant providing in-depth analysis.
For this complex query:
- Provide thorough, well-structured analysis
- Draw connections between different concepts
- Include specific details and examples
- Structure your response with clear sections
Base your response on provided context. Acknowledge limitations if context is insufficient.`,

  creative: `You are an AI assistant helping explore possibilities and ideas.
For this exploratory question:
- Think creatively about possibilities
- Suggest innovative approaches
- Be enthusiastic but grounded
- Encourage further exploration
Use context as a foundation for creative applications.`,

  research: `You are a research assistant specializing in deep analysis.
Your responses should be:
- Academic but approachable
- Precise in attributing claims
- Helpful in explaining concepts in depth
- Encouraging of critical thinking
Clearly distinguish between provided information and exploratory discussion.`,
};

// =============================================================================
// Timing Tracker Utility
// =============================================================================

export class TimingTracker {
  private startTime: number;
  private marks: Map<string, number> = new Map();
  private durations: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  measure(name: string, startMark: string): number {
    const startTime = this.marks.get(startMark) || this.startTime;
    const duration = Date.now() - startTime;
    this.durations.set(name, duration);
    return duration;
  }

  measureFromStart(name: string): number {
    const duration = Date.now() - this.startTime;
    this.durations.set(name, duration);
    return duration;
  }

  getDuration(name: string): number {
    return this.durations.get(name) || 0;
  }

  getTotalMs(): number {
    return Date.now() - this.startTime;
  }

  toObject(): Record<string, number> {
    const result: Record<string, number> = { totalMs: this.getTotalMs() };
    this.durations.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}

// =============================================================================
// Route Executor
// =============================================================================

export class RouteExecutor {
  private systemPrompts: Record<RouteType, string>;
  private providerManager: ProviderManager;

  constructor(config?: ExecutorConfig) {
    this.systemPrompts = {
      ...DEFAULT_SYSTEM_PROMPTS,
      ...config?.systemPrompts,
    };
    this.providerManager = config?.providerManager || new ProviderManager();
  }

  /**
   * Execute a query through the appropriate route
   */
  async execute(
    route: RouteType,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const timing = new TimingTracker();
    const routeConfig = getRouteConfig(route);
    const primaryModel = getRouteModel(route);

    timing.mark('generation_start');

    // Build messages
    const messages = this.buildMessages(context);

    // Get system prompt
    const systemPrompt = context.systemPrompt || this.systemPrompts[route];

    // Execute with provider manager
    const chatOptions: ChatOptions = {
      temperature: routeConfig.temperature,
      maxTokens: routeConfig.maxTokens,
    };

    let result: ChatResult;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;

    try {
      result = await this.providerManager.chat(messages, systemPrompt, chatOptions);
    } catch (error: any) {
      fallbackUsed = true;
      fallbackReason = error.message;
      throw error;
    }

    const generationMs = timing.measure('generationMs', 'generation_start');

    // Calculate costs
    const inputTokens = result.usage?.inputTokens || this.estimateTokens(
      systemPrompt + messages.map(m => m.content).join('')
    );
    const outputTokens = result.usage?.outputTokens || this.estimateTokens(result.content);

    return {
      answer: result.content,
      route,
      model: result.model,
      provider: result.provider,
      confidence: context.routerDecision?.confidence || 0.8,
      timing: {
        totalMs: timing.getTotalMs(),
        routingMs: context.routerDecision?.latencyMs,
        generationMs,
      },
      costs: {
        estimated: this.estimateCostFromTokens(result.model, inputTokens, outputTokens),
        inputTokens,
        outputTokens,
      },
      metadata: {
        fallbackUsed,
        fallbackReason,
        routerBypassed: context.routerDecision?.bypassed,
      },
    };
  }

  /**
   * Build messages array from context
   */
  private buildMessages(context: ExecutionContext): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add conversation history if present
    if (context.conversationHistory) {
      messages.push(...context.conversationHistory);
    }

    // Build the current query with context
    let userMessage = context.query;
    if (context.retrievedContext) {
      userMessage = `Context:\n${context.retrievedContext}\n\nQuestion: ${context.query}`;
    }

    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost from model and tokens
   */
  private estimateCostFromTokens(model: string, inputTokens: number, outputTokens: number): number {
    try {
      // Try to find model in registry by ID
      return estimateCost(model, inputTokens, outputTokens);
    } catch {
      // Default estimate if model not found
      const inputCost = (inputTokens / 1_000_000) * 3.00;
      const outputCost = (outputTokens / 1_000_000) * 15.00;
      return inputCost + outputCost;
    }
  }

  /**
   * Get system prompt for a route
   */
  getSystemPrompt(route: RouteType): string {
    return this.systemPrompts[route];
  }

  /**
   * Update system prompt for a route
   */
  setSystemPrompt(route: RouteType, prompt: string): void {
    this.systemPrompts[route] = prompt;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createExecutor(config?: ExecutorConfig): RouteExecutor {
  return new RouteExecutor(config);
}

export default RouteExecutor;
