/**
 * AI Providers - Unified interface for multiple LLM providers
 *
 * This module provides a consistent interface across Claude, GPT, and Gemini,
 * with automatic fallback on provider failures.
 *
 * @module providers
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =============================================================================
// Types
// =============================================================================

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  provider: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProvider {
  name: string;
  chat(
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult>;
  isAvailable(): boolean;
}

// =============================================================================
// Anthropic Provider (Claude)
// =============================================================================

export class AnthropicProvider implements AIProvider {
  name = 'Anthropic Claude';
  private client: Anthropic | null = null;
  private primaryModel: string;
  private fallbackModel: string;

  constructor(options?: { primaryModel?: string; fallbackModel?: string }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
    this.primaryModel = options?.primaryModel || 'claude-sonnet-4-20250514';
    this.fallbackModel = options?.fallbackModel || 'claude-3-5-haiku-20241022';
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chat(
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    if (!this.client) {
      throw new Error('Anthropic API key not configured');
    }

    const maxTokens = options?.maxTokens || (options?.jsonMode ? 8192 : 1024);

    try {
      const response = await this.client.messages.create({
        model: this.primaryModel,
        max_tokens: maxTokens,
        temperature: options?.temperature,
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response format from Anthropic');
      }

      if (response.stop_reason === 'max_tokens') {
        console.warn('[Anthropic] Response truncated - max_tokens reached');
      }

      return {
        content: content.text,
        provider: this.name,
        model: this.primaryModel,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error: any) {
      // Try fallback on rate limit or unavailability
      if (error?.status === 429 || error?.status === 503) {
        console.log(`[Anthropic] Primary failed, trying fallback model...`);
        return this.chatWithModel(this.fallbackModel, messages, systemPrompt, options);
      }
      throw error;
    }
  }

  private async chatWithModel(
    model: string,
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    const maxTokens = options?.maxTokens || (options?.jsonMode ? 8192 : 1024);

    const response = await this.client!.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: options?.temperature,
      system: systemPrompt,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Anthropic');
    }

    return {
      content: content.text,
      provider: this.name,
      model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

// =============================================================================
// OpenAI Provider (GPT)
// =============================================================================

export class OpenAIProvider implements AIProvider {
  name = 'OpenAI GPT';
  private client: OpenAI | null = null;
  private primaryModel: string;
  private fallbackModel: string;

  constructor(options?: { primaryModel?: string; fallbackModel?: string }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
    this.primaryModel = options?.primaryModel || 'gpt-4o';
    this.fallbackModel = options?.fallbackModel || 'gpt-4o-mini';
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chat(
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    const maxTokens = options?.maxTokens || (options?.jsonMode ? 8192 : 1024);

    try {
      const requestParams: any = {
        model: this.primaryModel,
        max_tokens: maxTokens,
        temperature: options?.temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
        ],
      };

      if (options?.jsonMode) {
        requestParams.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(requestParams);
      const choice = response.choices[0];

      if (!choice?.message?.content) {
        throw new Error('Unexpected response format from OpenAI');
      }

      if (choice.finish_reason === 'length') {
        console.warn('[OpenAI] Response truncated - max tokens reached');
      }

      return {
        content: choice.message.content,
        provider: this.name,
        model: this.primaryModel,
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
      };
    } catch (error: any) {
      if (error?.status === 429 || error?.status === 503) {
        console.log(`[OpenAI] Primary failed, trying fallback model...`);
        return this.chatWithModel(this.fallbackModel, messages, systemPrompt, options);
      }
      throw error;
    }
  }

  private async chatWithModel(
    model: string,
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    const maxTokens = options?.maxTokens || (options?.jsonMode ? 8192 : 1024);

    const requestParams: any = {
      model,
      max_tokens: maxTokens,
      temperature: options?.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      ],
    };

    if (options?.jsonMode) {
      requestParams.response_format = { type: 'json_object' };
    }

    const response = await this.client!.chat.completions.create(requestParams);
    const choice = response.choices[0];

    return {
      content: choice.message.content || '',
      provider: this.name,
      model,
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    };
  }
}

// =============================================================================
// Gemini Provider (Google)
// =============================================================================

export class GeminiProvider implements AIProvider {
  name = 'Google Gemini';
  private client: GoogleGenerativeAI | null = null;
  private primaryModel: string;
  private fallbackModel: string;

  constructor(options?: { primaryModel?: string; fallbackModel?: string }) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
    this.primaryModel = options?.primaryModel || 'gemini-1.5-pro';
    this.fallbackModel = options?.fallbackModel || 'gemini-1.5-flash';
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chat(
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    if (!this.client) {
      throw new Error('Google AI API key not configured');
    }

    const maxOutputTokens = options?.maxTokens || (options?.jsonMode ? 16384 : 2048);

    try {
      const modelConfig: any = {
        model: this.primaryModel,
        systemInstruction: systemPrompt,
        generationConfig: {
          maxOutputTokens,
          temperature: options?.temperature,
          ...(options?.jsonMode && { responseMimeType: 'application/json' }),
        },
      };

      const model = this.client.getGenerativeModel(modelConfig);

      // Convert to Gemini format
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const lastMessage = messages[messages.length - 1];
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;

      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        console.warn('[Gemini] Response truncated - MAX_TOKENS reached');
      }

      return {
        content: response.text(),
        provider: this.name,
        model: this.primaryModel,
        usage: response.usageMetadata ? {
          inputTokens: response.usageMetadata.promptTokenCount || 0,
          outputTokens: response.usageMetadata.candidatesTokenCount || 0,
        } : undefined,
      };
    } catch (error: any) {
      if (error?.status === 429 || error?.message?.includes('quota')) {
        console.log(`[Gemini] Primary failed, trying fallback model...`);
        return this.chatWithModel(this.fallbackModel, messages, systemPrompt, options);
      }
      throw error;
    }
  }

  private async chatWithModel(
    model: string,
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    const maxOutputTokens = options?.maxTokens || (options?.jsonMode ? 16384 : 2048);

    const modelConfig: any = {
      model,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens,
        temperature: options?.temperature,
        ...(options?.jsonMode && { responseMimeType: 'application/json' }),
      },
    };

    const genModel = this.client!.getGenerativeModel(modelConfig);
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = genModel.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);

    return {
      content: result.response.text(),
      provider: this.name,
      model,
      usage: result.response.usageMetadata ? {
        inputTokens: result.response.usageMetadata.promptTokenCount || 0,
        outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
      } : undefined,
    };
  }
}

// =============================================================================
// Provider Manager (Orchestrates all providers)
// =============================================================================

export interface ProviderManagerOptions {
  /** Order of providers to try (default: ['anthropic', 'openai', 'google']) */
  providerOrder?: Array<'anthropic' | 'openai' | 'google'>;
  /** Custom provider configurations */
  providerConfigs?: {
    anthropic?: { primaryModel?: string; fallbackModel?: string };
    openai?: { primaryModel?: string; fallbackModel?: string };
    google?: { primaryModel?: string; fallbackModel?: string };
  };
}

export class ProviderManager {
  private providers: AIProvider[] = [];

  constructor(options?: ProviderManagerOptions) {
    const order = options?.providerOrder || ['anthropic', 'openai', 'google'];
    const configs = options?.providerConfigs || {};

    const providerMap: Record<string, () => AIProvider> = {
      anthropic: () => new AnthropicProvider(configs.anthropic),
      openai: () => new OpenAIProvider(configs.openai),
      google: () => new GeminiProvider(configs.google),
    };

    // Initialize providers in specified order, filtering unavailable ones
    this.providers = order
      .map(name => providerMap[name]())
      .filter(provider => provider.isAvailable());

    if (this.providers.length === 0) {
      console.warn('[ProviderManager] No AI providers available');
    } else {
      console.log(
        `[ProviderManager] Initialized: ${this.providers.map(p => p.name).join(', ')}`
      );
    }
  }

  /**
   * Send a chat request, automatically falling back through providers on failure
   */
  async chat(
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    if (this.providers.length === 0) {
      throw new Error('No AI providers available. Please configure API keys.');
    }

    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        console.log(`[ProviderManager] Trying: ${provider.name}`);
        const result = await provider.chat(messages, systemPrompt, options);
        console.log(`[ProviderManager] Success: ${provider.name}`);
        return result;
      } catch (error: any) {
        console.error(`[ProviderManager] ${provider.name} failed:`, error.message);
        lastError = error;
      }
    }

    throw lastError || new Error('All AI providers failed');
  }

  /**
   * Get list of available provider names
   */
  getAvailableProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  /**
   * Check if any provider is available
   */
  isAvailable(): boolean {
    return this.providers.length > 0;
  }
}

// =============================================================================
// Default Export
// =============================================================================

export function createProviderManager(options?: ProviderManagerOptions): ProviderManager {
  return new ProviderManager(options);
}

export default ProviderManager;
