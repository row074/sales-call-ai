import { formatLatencyReport } from "../dist-electron/latencyTracker.js";

const report = formatLatencyReport({
  recordingStarted: 1000,
  deepgramOpen: 1180,
  firstInterim: 1600,
  finalized: 3200,
  openaiStarted: 3610,
  firstDelta: 3920,
  openaiCompleted: 4700,
});

const expected = [
  "Latency:",
  "- Deepgram connection: 180 ms",
  "- recording start → first interim transcript: 600 ms",
  "- finalized transcript → OpenAI request: 410 ms",
  "- OpenAI request → first token: 310 ms",
  "- finalized transcript → first visible suggestion: 720 ms",
  "- finalized transcript → completed suggestion: 1500 ms",
].join("\n");

if (report !== expected) {
  console.error("Latency report mismatch.\nGot:\n" + report);
  process.exit(1);
}

const partial = formatLatencyReport({
  recordingStarted: 1000,
  deepgramOpen: 1100,
  firstInterim: 1400,
  finalized: 2000,
  openaiStarted: 2400,
});

if (!partial.includes("OpenAI request → first token: n/a")) {
  console.error("Partial report should leave unmeasured OpenAI token timing as n/a.");
  process.exit(1);
}

console.log("Latency instrumentation checks passed.");
console.log(report);
