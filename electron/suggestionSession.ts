import OpenAI, { APIConnectionTimeoutError, APIUserAbortError, AuthenticationError } from "openai";
import type { WebContents } from "electron";
import { formatCacheReport, latencyTracker } from "./latencyTracker.js";
import type { SuggestionEvent, SuggestionRequestPayload, SuggestionStatus } from "./suggestionTypes.js";

const DEFAULT_MODEL = "gpt-4.1-mini";
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 180;
const MAX_UTTERANCES = 12;
const MAX_CONTEXT_CHARS = 2500;

export const PROMPT_CACHE_KEY = "sales-call-ai-copilot-v1";

export const STABLE_INSTRUCTIONS = `You are a live sales-call copilot. Your only job is to suggest the next thing the salesperson should say out loud, right now.

Role
You sit beside the salesperson. You hear a rolling transcript of the customer. You do not run the call. You do not speak as the company. You draft a brief spoken reply the salesperson can use immediately.

Spoken style
Write the reply as spoken English, not as an email, slide, or coaching note.
Use 1 to 3 short sentences.
Sound natural if read aloud.
Do not use headings, bullets, numbering, markdown, or labels such as "Suggested response".
Do not start with "You could say", "Try this", "As an AI", or similar framing.
Do not mention that this text was generated.

Accuracy and honesty
Address the customer's latest question or concern first.
Use only facts that already appear in the conversation, plus ordinary conversational acknowledgements.
Never invent product names, features, integrations, SLAs, security certifications, case studies, logos, customer counts, or implementation details.
Never invent pricing, discounts, contract terms, seat minimums, billing periods, or ROI numbers.
Never invent timelines, onboarding duration, staffing, or delivery dates.
Never claim the salesperson already promised something unless the transcript shows it.
If the transcript does not contain enough information, ask one brief clarifying question instead of guessing.
If the customer asks for a comparison and no comparison facts are in the transcript, acknowledge the question and ask what matters most in their current solution.
Prefer a precise clarifying question over a vague, confident answer.

How to handle common moments
If the customer is comparing vendors: acknowledge the comparison, ask what their current tool does well and where it falls short, and keep the reply short.
If the customer asks about price: do not quote a number. Ask about team size, usage, or success criteria, or offer to follow up with an exact figure after the call.
If the customer asks how long onboarding takes: do not invent a duration. Ask what a successful rollout looks like for them, or say you will confirm the usual range with the team.
If the customer is hesitant: name the hesitation in their words, then ask one question that uncovers the real blocker.
If the customer is confused: restate their point in plain language and confirm you heard it before asking the next question.
If several topics appear, answer the latest one and do not reopen earlier topics unless the latest question depends on them.

What not to do
Do not recap the entire call.
Do not list more than one optional next step unless the customer asked for options.
Do not pitch a full product tour.
Do not change the subject to an unrelated feature.
Do not add legal, medical, or financial advice.
Do not include internal coaching commentary.

Discovery
When the customer has not stated a goal, ask what they are trying to improve: time, cost, risk, quality, or visibility.
When multiple people are implied, ask who else evaluates this decision, without assuming titles.
When a pain is mentioned, ask how they handle it today before describing any product.
When they mention a timeline, repeat their words and ask what is driving that date.
When they mention a budget, do not fill in a number. Ask whether they are exploring options or already comparing finalists.

Silence and pacing
If the latest utterance is a short acknowledgement, do not launch a new pitch. Ask a narrow follow-up or wait with a simple invitation to continue.
If the customer is mid-thought, do not interrupt with a feature list.
If they ask two questions at once, answer the last one first unless the first is required to make the last one make sense.

Multi-threading
Keep one thread in the spoken reply. If earlier context is needed, use a short clause, not a recap paragraph.
Do not concatenate several unrelated value propositions.
If you already asked a clarifying question in a previous suggestion and the customer has now answered it, move forward using that answer instead of asking the same question again.

Meetings and next steps
Do not schedule a meeting unless the customer asked to meet or the transcript already includes a meeting request.
If they ask what happens next, describe a lightweight next step in plain language and only include details present in the conversation.
If they want a follow-up, ask what they want in that follow-up: comparison notes, a demo focused on one workflow, or a question for their team.

Prefix stability
These instructions are fixed for every suggestion request during a call.
Do not expect generated dates, request identifiers, or other changing metadata in this block.
The current conversation is supplied separately after these instructions and will change as the customer speaks.

Output
Write only the spoken reply.`;

function emit(sender: WebContents | null, event: SuggestionEvent): void {
  if (!sender || sender.isDestroyed()) {
    return;
  }
  sender.send("suggestion:event", event);
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof APIUserAbortError) {
    return "";
  }
  if (error instanceof AuthenticationError) {
    return "OpenAI authentication failed. Check OPENAI_API_KEY.";
  }
  if (error instanceof APIConnectionTimeoutError) {
    return "The OpenAI request timed out. Try again.";
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid api key")) {
    return "OpenAI authentication failed. Check OPENAI_API_KEY.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The OpenAI request timed out. Try again.";
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("enotfound")) {
    return "Could not reach OpenAI. Check your network connection.";
  }
  return message || "OpenAI request failed.";
}

function chosenModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

let openaiClient: OpenAI | null = null;
let openaiClientKey = "";

function openai(apiKey: string): OpenAI {
  if (!openaiClient || openaiClientKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    openaiClientKey = apiKey;
  }
  return openaiClient;
}

function mockOpenAIEnabled(): boolean {
  return process.env.SALES_CALL_AI_MOCK_OPENAI === "1";
}

export function boundedUtterances(utterances: string[]): string[] {
  const cleaned = utterances.map((item) => item.trim()).filter(Boolean);
  const recent = cleaned.slice(-MAX_UTTERANCES);
  let total = 0;
  const selected: string[] = [];
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const next = recent[index];
    if (total + next.length > MAX_CONTEXT_CHARS && selected.length > 0) {
      break;
    }
    selected.unshift(next);
    total += next.length;
  }
  return selected;
}

export function buildDynamicInput(utterances: string[]): string {
  const lines = utterances.map((utterance, index) => {
    const isLatest = index === utterances.length - 1;
    const label = isLatest ? "Customer (latest)" : "Customer";
    return `${label}: ${utterance}`;
  });
  return `${lines.join("\n")}\n\nSuggest the salesperson's next spoken reply to the latest customer utterance.`;
}

export function buildCachedResponseParams(utterances: string[]) {
  return {
    model: chosenModel(),
    instructions: STABLE_INSTRUCTIONS,
    prompt_cache_key: PROMPT_CACHE_KEY,
    input: buildDynamicInput(utterances),
    max_output_tokens: MAX_OUTPUT_TOKENS,
    stream: true as const,
  };
}

function printCacheUsage(usage: {
  input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
} | undefined): void {
  if (!usage) {
    return;
  }
  const report = formatCacheReport({
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens,
  });
  if (report) {
    console.info(report);
  }
}

export class SuggestionSession {
  private generation = 0;
  private abort: AbortController | null = null;
  private sender: WebContents | null = null;
  private status: SuggestionStatus = "idle";

  async generate(sender: WebContents, payload: SuggestionRequestPayload): Promise<void> {
    this.abort?.abort();
    const sessionId = ++this.generation;
    this.sender = sender;
    this.abort = new AbortController();
    const timeout = setTimeout(() => this.abort?.abort(), REQUEST_TIMEOUT_MS);

    const utterances = boundedUtterances(payload.utterances ?? []);
    if (utterances.length === 0) {
      this.fail(sender, "No finalized customer speech is available yet.");
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey && !mockOpenAIEnabled()) {
      this.fail(sender, "Missing OPENAI_API_KEY. Add it to a local .env file and restart the app.");
      return;
    }

    this.setStatus("generating");
    latencyTracker.mark("openaiStarted");
    console.info("[openai] request started");

    let sawFirstDelta = false;

    try {
      if (mockOpenAIEnabled()) {
        await this.emitMockStream(sessionId);
        return;
      }

      const client = openai(apiKey ?? "");
      const stream = await client.responses.create(buildCachedResponseParams(utterances), {
        signal: this.abort.signal,
      });

      for await (const event of stream) {
        if (sessionId !== this.generation) {
          return;
        }
        if (event.type === "response.output_text.delta" && event.delta) {
          if (!sawFirstDelta) {
            sawFirstDelta = true;
            latencyTracker.mark("firstDelta");
            console.info("[openai] first response delta received");
          }
          emit(this.sender, { type: "delta", text: event.delta });
        }
        if (event.type === "response.completed") {
          printCacheUsage(event.response.usage);
        }
      }

      if (sessionId !== this.generation) {
        return;
      }
      console.info("[openai] response completed");
      latencyTracker.mark("openaiCompleted");
      this.setStatus("ready");
      emit(this.sender, { type: "done" });
      latencyTracker.printReport();
    } catch (error) {
      if (sessionId !== this.generation || error instanceof APIUserAbortError) {
        return;
      }
      const message = publicErrorMessage(error);
      console.error("[openai] request failed", message);
      latencyTracker.printReport();
      this.fail(sender, message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async emitMockStream(sessionId: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (sessionId !== this.generation) {
      return;
    }
    latencyTracker.mark("firstDelta");
    console.info("[openai] first response delta received");
    emit(this.sender, { type: "delta", text: "That's a fair comparison to ask. " });
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (sessionId !== this.generation) {
      return;
    }
    emit(this.sender, {
      type: "delta",
      text: "What does your current solution handle well, and where is it falling short?",
    });
    latencyTracker.mark("openaiCompleted");
    this.setStatus("ready");
    emit(this.sender, { type: "done" });
    console.info("[openai] response completed");
    latencyTracker.printReport();
  }

  cancel(): void {
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
    this.status = "idle";
    emit(this.sender, { type: "reset" });
  }

  private setStatus(status: SuggestionStatus): void {
    this.status = status;
    emit(this.sender, { type: "status", status });
  }

  private fail(sender: WebContents, message: string): void {
    this.status = "error";
    emit(sender, { type: "status", status: "error" });
    emit(sender, { type: "error", message });
  }
}

export const suggestionSession = new SuggestionSession();
