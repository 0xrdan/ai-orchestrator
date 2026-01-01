/**
 * Intelligent Router - Query Classification and Route Selection
 *
 * This module analyzes incoming queries and determines the optimal
 * processing route based on complexity, intent, and domain.
 *
 * @module router
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  RouteType,
  SPECIALIZED_MODELS,
  getModelId,
} from './model-registry';

// =============================================================================
// Types
// =============================================================================

export interface RouterInput {
  query: string;
  mode?: 'research' | 'standard';
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: Record<string, any>;
}

export interface RouterDecision {
  route: RouteType;
  confidence: number;           // 0-1 confidence in the routing decision
  reasoning: string;            // Brief explanation for logging
  complexitySignals: string[];  // Detected complexity indicators
  bypassed: boolean;            // True if router was bypassed for simple query
  timestamp: Date;
  latencyMs?: number;
}

export interface RouterStats {
  totalRouted: number;
  bypassedCount: number;
  routeDistribution: Record<RouteType, number>;
  avgLatencyMs: number;
  avgConfidence: number;
}

export interface RouterConfig {
  /** Custom complexity signals to detect */
  complexSignals?: string[];
  /** Custom research signals */
  researchSignals?: string[];
  /** Custom creative signals */
  creativeSignals?: string[];
  /** Patterns for simple query bypass */
  simplePatterns?: RegExp[];
  /** Custom system prompt for the router */
  systemPrompt?: string;
}

// =============================================================================
// Default Signal Configurations
// =============================================================================

const DEFAULT_COMPLEX_SIGNALS = [
  'compare', 'contrast', 'analyze', 'explain why', 'explain how',
  'how does', 'what if', 'relationship between', 'implications',
  'trade-offs', 'advantages', 'disadvantages', 'pros and cons',
  'difference between', 'similar to', 'versus', 'vs',
  'in-depth', 'detailed', 'comprehensive', 'thoroughly',
  'multiple', 'several', 'various', 'all the',
];

const DEFAULT_RESEARCH_SIGNALS = [
  'methodology', 'approach', 'theory', 'concept', 'framework',
  'hypothesis', 'findings', 'results', 'conclusion', 'evidence',
  'literature', 'study', 'research', 'paper', 'article',
  'according to', 'based on', 'in the context of',
];

const DEFAULT_CREATIVE_SIGNALS = [
  'imagine', 'what kind of', 'possibilities', 'ideas for',
  'brainstorm', 'creative', 'innovative', 'future',
  'could', 'might', 'potential', 'explore',
];

const DEFAULT_SIMPLE_PATTERNS = [
  /^what (is|are) .{1,50}\??$/i,
  /^(list|show|tell me|give me) .{1,40}$/i,
  /^(what|which) (technologies?|languages?|skills?|tools?)/i,
  /^how (long|many|much)/i,
  /^where (is|does|did)/i,
  /^when did/i,
];

// =============================================================================
// Default Router System Prompt
// =============================================================================

const DEFAULT_ROUTER_PROMPT = `You are a query routing assistant. Analyze user queries and determine the optimal processing route.

## Available Routes

### FAST
- For: Simple factual questions, direct lookups, basic info
- Signals: Short queries, clear intent, single topic, "what/who/when" questions

### STANDARD
- For: Normal complexity questions requiring synthesis
- Signals: Multi-part questions, "how/why" questions, needs context integration

### DEEP
- For: Complex analysis, comparisons, multi-step reasoning
- Signals: Comparative questions, theoretical exploration, connecting multiple concepts

### CREATIVE
- For: Open-ended exploration, brainstorming, hypothetical scenarios
- Signals: Exploratory language, no single right answer, future-focused

### RESEARCH
- For: Deep academic discussion, methodology-focused queries
- Signals: References to methodology, findings, theories; needs extensive context

## Instructions
1. Analyze the query for complexity signals
2. Consider the mode (research vs standard)
3. Select the most appropriate route
4. Provide brief reasoning

## Output Format (JSON)
{
  "route": "fast|standard|deep|creative|research",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "complexity_signals": ["signal1", "signal2"]
}`;

// =============================================================================
// IntelligentRouter Class
// =============================================================================

export class IntelligentRouter {
  private client: Anthropic | null = null;
  private modelId: string;
  private config: Required<RouterConfig>;
  private stats: RouterStats = {
    totalRouted: 0,
    bypassedCount: 0,
    routeDistribution: { fast: 0, standard: 0, deep: 0, creative: 0, research: 0 },
    avgLatencyMs: 0,
    avgConfidence: 0,
  };

  constructor(config?: RouterConfig) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }

    // Get the router model from registry
    const routerModelKey = SPECIALIZED_MODELS.router;
    this.modelId = getModelId(routerModelKey);

    // Merge config with defaults
    this.config = {
      complexSignals: config?.complexSignals || DEFAULT_COMPLEX_SIGNALS,
      researchSignals: config?.researchSignals || DEFAULT_RESEARCH_SIGNALS,
      creativeSignals: config?.creativeSignals || DEFAULT_CREATIVE_SIGNALS,
      simplePatterns: config?.simplePatterns || DEFAULT_SIMPLE_PATTERNS,
      systemPrompt: config?.systemPrompt || DEFAULT_ROUTER_PROMPT,
    };

    console.log(`[Router] Initialized with model: ${this.modelId}`);
  }

  /**
   * Determine the optimal route for a query
   */
  async route(input: RouterInput): Promise<RouterDecision> {
    const startTime = Date.now();
    const mode = input.mode || 'standard';

    // Check for bypass conditions first
    const bypassRoute = this.shouldBypass(input.query, mode);
    if (bypassRoute) {
      const decision: RouterDecision = {
        route: bypassRoute,
        confidence: 0.95,
        reasoning: 'Query matched simple pattern - router bypassed',
        complexitySignals: [],
        bypassed: true,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
      };

      this.updateStats(decision);
      return decision;
    }

    // If no API client, use heuristic routing
    if (!this.client) {
      console.warn('[Router] No Anthropic client, using heuristic routing');
      return this.heuristicRoute(input.query, mode, startTime);
    }

    try {
      const decision = await this.llmRoute(input, startTime);
      this.updateStats(decision);
      return decision;
    } catch (error) {
      console.error('[Router] LLM routing failed, falling back to heuristic', error);
      return this.heuristicRoute(input.query, mode, startTime);
    }
  }

  /**
   * Check if the query can bypass the router entirely
   */
  private shouldBypass(query: string, mode: string): RouteType | null {
    // Research mode queries should not be bypassed
    if (mode === 'research') {
      return null;
    }

    const words = query.trim().split(/\s+/);

    // Very short queries without complex signals → fast route
    if (words.length < 8 && !this.hasComplexSignals(query)) {
      if (this.config.simplePatterns.some(pattern => pattern.test(query))) {
        return 'fast';
      }
    }

    // Very short, simple queries
    if (words.length <= 5 && !this.hasComplexSignals(query)) {
      return 'fast';
    }

    return null;
  }

  /**
   * Check if query contains complex signals
   */
  private hasComplexSignals(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return this.config.complexSignals.some(signal => lowerQuery.includes(signal));
  }

  /**
   * Check if query contains research signals
   */
  private hasResearchSignals(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return this.config.researchSignals.some(signal => lowerQuery.includes(signal));
  }

  /**
   * Check if query contains creative signals
   */
  private hasCreativeSignals(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return this.config.creativeSignals.some(signal => lowerQuery.includes(signal));
  }

  /**
   * Use LLM to route the query
   */
  private async llmRoute(input: RouterInput, startTime: number): Promise<RouterDecision> {
    const { query, mode, context } = input;

    let userMessage = `Query: "${query}"\nMode: ${mode || 'standard'}`;
    if (context) {
      userMessage += `\nContext: ${JSON.stringify(context)}`;
    }

    const response = await this.client!.messages.create({
      model: this.modelId,
      max_tokens: 256,
      system: this.config.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from router');
    }

    const parsed = this.parseRouterResponse(content.text);

    return {
      route: parsed.route,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      complexitySignals: parsed.complexity_signals || [],
      bypassed: false,
      timestamp: new Date(),
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Parse the router's JSON response
   */
  private parseRouterResponse(text: string): {
    route: RouteType;
    confidence: number;
    reasoning: string;
    complexity_signals?: string[];
  } {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate route
      const validRoutes: RouteType[] = ['fast', 'standard', 'deep', 'creative', 'research'];
      if (!validRoutes.includes(parsed.route)) {
        parsed.route = 'standard';
      }

      // Validate confidence
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));

      return parsed;
    } catch (error) {
      console.error('[Router] Failed to parse response, using standard route', error);
      return {
        route: 'standard',
        confidence: 0.5,
        reasoning: 'Failed to parse router response',
        complexity_signals: [],
      };
    }
  }

  /**
   * Heuristic-based routing (fallback when LLM unavailable)
   */
  private heuristicRoute(query: string, mode: string, startTime: number): RouterDecision {
    const lowerQuery = query.toLowerCase();
    const wordCount = query.trim().split(/\s+/).length;

    let route: RouteType = 'standard';
    let confidence = 0.7;
    let reasoning = 'Heuristic routing based on query analysis';
    const signals: string[] = [];

    // Research mode with research signals → research route
    if (mode === 'research') {
      if (this.hasResearchSignals(query)) {
        route = 'research';
        confidence = 0.85;
        reasoning = 'Research mode with research-related signals';
        signals.push('research_mode', 'research_signals');
      } else {
        route = 'standard';
        confidence = 0.75;
        reasoning = 'Research mode with general query';
        signals.push('research_mode');
      }
    }
    // Creative signals → creative route
    else if (this.hasCreativeSignals(query)) {
      route = 'creative';
      confidence = 0.8;
      reasoning = 'Query contains creative/exploratory language';
      signals.push(...this.config.creativeSignals.filter(s => lowerQuery.includes(s)));
    }
    // Complex signals → deep route
    else if (this.hasComplexSignals(query)) {
      route = 'deep';
      confidence = 0.8;
      reasoning = 'Query contains complexity signals';
      signals.push(...this.config.complexSignals.filter(s => lowerQuery.includes(s)));
    }
    // Short simple queries → fast route
    else if (wordCount < 10 && this.config.simplePatterns.some(p => p.test(query))) {
      route = 'fast';
      confidence = 0.85;
      reasoning = 'Simple query pattern detected';
      signals.push('simple_pattern');
    }

    const decision: RouterDecision = {
      route,
      confidence,
      reasoning,
      complexitySignals: signals,
      bypassed: false,
      timestamp: new Date(),
      latencyMs: Date.now() - startTime,
    };

    this.updateStats(decision);
    return decision;
  }

  /**
   * Update internal stats
   */
  private updateStats(decision: RouterDecision): void {
    this.stats.totalRouted++;
    this.stats.routeDistribution[decision.route]++;

    if (decision.bypassed) {
      this.stats.bypassedCount++;
    }

    const n = this.stats.totalRouted;
    this.stats.avgLatencyMs =
      ((this.stats.avgLatencyMs * (n - 1)) + (decision.latencyMs || 0)) / n;
    this.stats.avgConfidence =
      ((this.stats.avgConfidence * (n - 1)) + decision.confidence) / n;
  }

  /**
   * Get router statistics
   */
  getStats(): RouterStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRouted: 0,
      bypassedCount: 0,
      routeDistribution: { fast: 0, standard: 0, deep: 0, creative: 0, research: 0 },
      avgLatencyMs: 0,
      avgConfidence: 0,
    };
  }

  /**
   * Check if router has LLM capability
   */
  isLLMAvailable(): boolean {
    return this.client !== null;
  }
}

// =============================================================================
// Factory and Singleton
// =============================================================================

let routerInstance: IntelligentRouter | null = null;

export function getRouter(config?: RouterConfig): IntelligentRouter {
  if (!routerInstance) {
    routerInstance = new IntelligentRouter(config);
  }
  return routerInstance;
}

export function createRouter(config?: RouterConfig): IntelligentRouter {
  return new IntelligentRouter(config);
}

export default IntelligentRouter;
