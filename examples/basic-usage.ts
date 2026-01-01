/**
 * AI Orchestrator - Basic Usage Examples
 *
 * This file demonstrates the core functionality of the AI Orchestrator.
 * Run with: npx ts-node examples/basic-usage.ts
 */

import {
  Orchestrator,
  IntelligentRouter,
  ProviderManager,
  getModel,
  estimateCost,
  getCheapestModel,
} from '../src';

async function main() {
  console.log('=== AI Orchestrator Examples ===\n');

  // ----------------------------------------------------------------------------
  // Example 1: Basic Orchestrator Usage
  // ----------------------------------------------------------------------------
  console.log('--- Example 1: Basic Orchestrator ---');

  const orchestrator = new Orchestrator();

  // Check available providers
  console.log('Available providers:', orchestrator.getAvailableProviders());

  if (!orchestrator.isReady()) {
    console.log('No providers configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY');
    return;
  }

  // Simple query (will route to 'fast')
  const simpleResult = await orchestrator.process({
    query: 'What is TypeScript?',
  });

  console.log('\nSimple query result:');
  console.log(`  Route: ${simpleResult.route}`);
  console.log(`  Model: ${simpleResult.model}`);
  console.log(`  Answer: ${simpleResult.answer.substring(0, 100)}...`);
  console.log(`  Latency: ${simpleResult.timing.totalMs}ms`);

  // Complex query (will route to 'deep')
  const complexResult = await orchestrator.process({
    query: 'Compare and contrast microservices vs monolith architectures, including trade-offs and when to use each.',
  });

  console.log('\nComplex query result:');
  console.log(`  Route: ${complexResult.route}`);
  console.log(`  Model: ${complexResult.model}`);
  console.log(`  Confidence: ${complexResult.confidence}`);
  console.log(`  Cost: $${complexResult.costs.estimated.toFixed(4)}`);

  // ----------------------------------------------------------------------------
  // Example 2: Force a Specific Route
  // ----------------------------------------------------------------------------
  console.log('\n--- Example 2: Force Specific Route ---');

  const creativResult = await orchestrator.processWithRoute('creative', {
    query: 'Imagine a world where AI and humans collaborate seamlessly. What does that look like?',
  });

  console.log(`  Route: ${creativResult.route}`);
  console.log(`  Answer preview: ${creativResult.answer.substring(0, 150)}...`);

  // ----------------------------------------------------------------------------
  // Example 3: Router Statistics
  // ----------------------------------------------------------------------------
  console.log('\n--- Example 3: Router Statistics ---');

  const stats = orchestrator.getStats();
  console.log('Router stats:', stats);

  // ----------------------------------------------------------------------------
  // Example 4: Direct Router Access
  // ----------------------------------------------------------------------------
  console.log('\n--- Example 4: Direct Router Access ---');

  const router = new IntelligentRouter();

  const decision = await router.route({
    query: 'What are the key differences between React and Vue frameworks?',
  });

  console.log('Routing decision:');
  console.log(`  Route: ${decision.route}`);
  console.log(`  Confidence: ${decision.confidence}`);
  console.log(`  Reasoning: ${decision.reasoning}`);
  console.log(`  Signals: ${decision.complexitySignals.join(', ') || 'none'}`);
  console.log(`  Latency: ${decision.latencyMs}ms`);

  // ----------------------------------------------------------------------------
  // Example 5: Model Registry Access
  // ----------------------------------------------------------------------------
  console.log('\n--- Example 5: Model Registry ---');

  const sonnet = getModel('claude-sonnet-4');
  if (sonnet) {
    console.log('Claude Sonnet 4:');
    console.log(`  Context window: ${sonnet.contextWindow.toLocaleString()} tokens`);
    console.log(`  Input cost: $${sonnet.inputCost}/1M tokens`);
    console.log(`  Output cost: $${sonnet.outputCost}/1M tokens`);
  }

  // Estimate cost
  const estimatedCost = estimateCost('claude-sonnet-4', 2000, 500);
  console.log(`\nEstimated cost for 2K input + 500 output: $${estimatedCost.toFixed(4)}`);

  // Find cheapest model with 100K context
  const cheapest = getCheapestModel({ minContextWindow: 100000 });
  if (cheapest) {
    console.log(`\nCheapest model with 100K+ context: ${cheapest.id}`);
  }

  // ----------------------------------------------------------------------------
  // Example 6: Custom Configuration
  // ----------------------------------------------------------------------------
  console.log('\n--- Example 6: Custom Configuration ---');

  const customOrchestrator = new Orchestrator({
    // Prefer OpenAI first
    providers: {
      providerOrder: ['openai', 'anthropic', 'google'],
    },
    // Custom router signals
    router: {
      complexSignals: ['analyze', 'compare', 'evaluate', 'assess'],
      simplePatterns: [/^what is/i, /^define/i],
    },
    // Custom system prompts
    executor: {
      systemPrompts: {
        fast: 'You are a concise assistant. Answer in 1-2 sentences.',
      },
    },
  });

  console.log('Custom orchestrator providers:', customOrchestrator.getAvailableProviders());

  console.log('\n=== Examples Complete ===');
}

// Run examples
main().catch(console.error);
