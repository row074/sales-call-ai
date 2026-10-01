export type LatencyMarks = {
  recordingStarted?: number;
  deepgramOpen?: number;
  firstInterim?: number;
  finalized?: number;
  openaiStarted?: number;
  firstDelta?: number;
  openaiCompleted?: number;
};

export type CacheUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
};

function interval(start?: number, end?: number): string {
  if (start == null || end == null) {
    return "n/a";
  }
  return `${Math.max(0, Math.round(end - start))} ms`;
}

export function formatLatencyReport(marks: LatencyMarks): string {
  return [
    "Latency:",
    `- Deepgram connection: ${interval(marks.recordingStarted, marks.deepgramOpen)}`,
    `- recording start → first interim transcript: ${interval(marks.recordingStarted, marks.firstInterim)}`,
    `- finalized transcript → OpenAI request: ${interval(marks.finalized, marks.openaiStarted)}`,
    `- OpenAI request → first token: ${interval(marks.openaiStarted, marks.firstDelta)}`,
    `- finalized transcript → first visible suggestion: ${interval(marks.finalized, marks.firstDelta)}`,
    `- finalized transcript → completed suggestion: ${interval(marks.finalized, marks.openaiCompleted)}`,
  ].join("\n");
}

export function formatCacheReport(usage: CacheUsage): string | null {
  const lines: string[] = ["Cache:"];
  if (typeof usage.inputTokens === "number") {
    lines.push(`- input tokens: ${usage.inputTokens}`);
  }
  if (typeof usage.cachedInputTokens === "number") {
    lines.push(`- cached input tokens: ${usage.cachedInputTokens}`);
  }
  if (lines.length === 1) {
    return null;
  }
  return lines.join("\n");
}

export class LatencyTracker {
  private marks: LatencyMarks = {};

  reset(): void {
    this.marks = {};
  }

  mark(key: keyof LatencyMarks, at = Date.now()): void {
    if ((key === "deepgramOpen" || key === "firstInterim" || key === "recordingStarted") && this.marks[key] != null) {
      return;
    }
    this.marks[key] = at;
  }

  snapshot(): LatencyMarks {
    return { ...this.marks };
  }

  printReport(): void {
    console.info(formatLatencyReport(this.marks));
  }
}

export const latencyTracker = new LatencyTracker();
