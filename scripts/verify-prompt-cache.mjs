import { formatCacheReport } from "../dist-electron/latencyTracker.js";
import {
  PROMPT_CACHE_KEY,
  STABLE_INSTRUCTIONS,
  boundedUtterances,
  buildCachedResponseParams,
  buildDynamicInput,
} from "../dist-electron/suggestionSession.js";

const first = buildCachedResponseParams([
  "Your product sounds interesting, but how does it compare with the solution we're using now?",
]);
const second = buildCachedResponseParams([
  "Your product sounds interesting, but how does it compare with the solution we're using now?",
  "What about pricing and how long would onboarding take?",
]);

if (first.instructions !== STABLE_INSTRUCTIONS || second.instructions !== STABLE_INSTRUCTIONS) {
  console.error("Stable instructions must be identical on every request.");
  process.exit(1);
}

if (first.prompt_cache_key !== PROMPT_CACHE_KEY || second.prompt_cache_key !== PROMPT_CACHE_KEY) {
  console.error("prompt_cache_key must stay constant.");
  process.exit(1);
}

if (first.stream !== true || second.stream !== true) {
  console.error("Streaming must remain enabled.");
  process.exit(1);
}

if (first.input === second.input) {
  console.error("Dynamic conversation input must change when the latest utterance changes.");
  process.exit(1);
}

if (first.instructions !== second.instructions) {
  console.error("Stable instructions must be identical on every request.");
  process.exit(1);
}

if (/\b\d{4}-\d{2}-\d{2}\b/.test(STABLE_INSTRUCTIONS) || /T\d{2}:\d{2}:\d{2}/.test(STABLE_INSTRUCTIONS)) {
  console.error("Stable instructions must not include generated timestamps.");
  process.exit(1);
}

const latest = "What about pricing and how long would onboarding take?";
const dynamic = buildDynamicInput([
  "Your product sounds interesting, but how does it compare with the solution we're using now?",
  latest,
]);
if (!dynamic.includes("Customer (latest): " + latest)) {
  console.error("Latest customer utterance must appear in the dynamic input.");
  process.exit(1);
}

if (dynamic.includes(STABLE_INSTRUCTIONS.slice(0, 80))) {
  console.error("Stable instructions must not be copied into the dynamic input.");
  process.exit(1);
}

const cacheReport = formatCacheReport({ inputTokens: 1400, cachedInputTokens: 1024 });
if (cacheReport !== "Cache:\n- input tokens: 1400\n- cached input tokens: 1024") {
  console.error("Unexpected cache report:\n" + cacheReport);
  process.exit(1);
}

if (formatCacheReport({}) !== null) {
  console.error("Empty cache usage should not print a report.");
  process.exit(1);
}

const estimatedTokens = Math.round(STABLE_INSTRUCTIONS.length / 4);
if (estimatedTokens < 1024) {
  console.error(`Stable prefix is only ~${estimatedTokens} tokens; gpt-4.1-mini cache eligibility typically needs 1024+.`);
  process.exit(1);
}

const overflow = Array.from({ length: 20 }, (_, index) => `Customer utterance number ${index + 1} with enough text.`);
if (boundedUtterances(overflow).length > 12) {
  console.error("Conversation context must stay bounded.");
  process.exit(1);
}

console.log("Prompt cache request structure checks passed.");
console.log(`Stable instruction characters: ${STABLE_INSTRUCTIONS.length}`);
console.log(`prompt_cache_key: ${PROMPT_CACHE_KEY}`);
