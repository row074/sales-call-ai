import { DeepgramClient } from "@deepgram/sdk";
import type { WebContents } from "electron";
import { latencyTracker } from "./latencyTracker.js";
import type { TranscriptionEvent, TranscriptionStatus } from "./transcriptionTypes.js";

type LiveConnection = Awaited<ReturnType<DeepgramClient["listen"]["v1"]["connect"]>>;

const MAX_QUEUED_CHUNKS = 40;

function emit(sender: WebContents | null, event: TranscriptionEvent): void {
  if (!sender || sender.isDestroyed()) {
    return;
  }
  sender.send("transcription:event", event);
}

function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("invalid credentials")
  ) {
    return "Deepgram authentication failed. Check DEEPGRAM_API_KEY.";
  }
  return message || "Deepgram connection failed.";
}

function isContainerizedAudio(mimeType: string): boolean {
  return /webm|ogg|mp4|mpeg/i.test(mimeType);
}

export class DeepgramLiveSession {
  private generation = 0;
  private sender: WebContents | null = null;
  private connection: LiveConnection | null = null;
  private abort: AbortController | null = null;
  private queue: ArrayBuffer[] = [];
  private opened = false;
  private closing = false;
  private sawFirstTranscript = false;
  private status: TranscriptionStatus = "idle";

  async start(sender: WebContents, mimeType: string): Promise<void> {
    this.generation += 1;
    await this.dispose();

    const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
    if (!apiKey) {
      this.fail(sender, "Missing DEEPGRAM_API_KEY. Add it to a local .env file and restart the app.");
      throw new Error("Missing DEEPGRAM_API_KEY");
    }

    const sessionId = ++this.generation;
    this.sender = sender;
    this.queue = [];
    this.opened = false;
    this.closing = false;
    this.sawFirstTranscript = false;
    this.setStatus("connecting");

    const abort = new AbortController();
    this.abort = abort;

    const client = new DeepgramClient({ apiKey });
    const containerized = isContainerizedAudio(mimeType);
    console.info(
      `[deepgram] starting live session; mimeType=${mimeType || "unknown"}; ` +
        (containerized
          ? "sending containerized audio (no encoding/sample_rate override)"
          : "mimeType is not a known container; Deepgram will inspect the stream"),
    );

    try {
      const connection = await client.listen.v1.connect({
        model: "nova-3",
        language: "en",
        smart_format: "true",
        punctuate: "true",
        interim_results: "true",
        endpointing: "500",
        reconnectAttempts: 0,
        connectionTimeoutInSeconds: 15,
        abortSignal: abort.signal,
        shouldReconnect: () => false,
      });

      if (sessionId !== this.generation) {
        connection.close();
        return;
      }

      this.connection = connection;

      connection.on("open", () => {
        if (sessionId !== this.generation) {
          return;
        }
        this.opened = true;
        latencyTracker.mark("deepgramOpen");
        console.info("[deepgram] connection opened");
        this.setStatus("listening");
        this.flushQueue();
      });

      connection.on("message", (data) => {
        if (sessionId !== this.generation || data.type !== "Results") {
          return;
        }
        const text = data.channel.alternatives[0]?.transcript ?? "";
        if (!text) {
          return;
        }
        if (!data.is_final) {
          latencyTracker.mark("firstInterim");
        } else {
          latencyTracker.mark("finalized");
        }
        if (!this.sawFirstTranscript) {
          this.sawFirstTranscript = true;
          console.info("[deepgram] first transcript received");
        }
        this.setStatus("transcribing");
        emit(this.sender, { type: "transcript", text, isFinal: Boolean(data.is_final) });
      });

      connection.on("error", (error) => {
        if (sessionId !== this.generation || this.closing) {
          return;
        }
        console.error("[deepgram] error", publicErrorMessage(error));
        this.fail(sender, publicErrorMessage(error));
        void this.dispose();
      });

      connection.on("close", (event) => {
        if (sessionId !== this.generation) {
          return;
        }
        console.info(`[deepgram] connection closed code=${event.code}`);
        this.connection = null;
        this.opened = false;
        if (!this.closing && this.status !== "error") {
          this.fail(sender, "Deepgram connection closed unexpectedly.");
        } else if (this.status !== "error") {
          this.setStatus("idle");
        }
      });

      connection.connect();
      await connection.waitForOpen();
    } catch (error) {
      if (sessionId !== this.generation) {
        return;
      }
      const message = publicErrorMessage(error);
      console.error("[deepgram] failed to connect", message);
      this.fail(sender, message);
      await this.dispose();
      throw new Error(message);
    }
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.closing) {
      return;
    }

    if (!this.opened) {
      if (this.status === "connecting") {
        this.enqueue(chunk);
      }
      return;
    }

    this.write(chunk);
  }

  async stop(): Promise<void> {
    const hadConnection = Boolean(this.connection) || this.opened;
    this.generation += 1;
    await this.dispose();
    this.setStatus("idle");
    if (hadConnection) {
      console.info("[deepgram] connection closed");
    }
  }

  private enqueue(chunk: ArrayBuffer): void {
    this.queue.push(chunk);
    if (this.queue.length > MAX_QUEUED_CHUNKS) {
      this.queue.shift();
    }
  }

  private flushQueue(): void {
    const pending = this.queue;
    this.queue = [];
    for (const chunk of pending) {
      this.write(chunk);
    }
  }

  private write(chunk: ArrayBuffer): void {
    if (!this.connection || !this.opened) {
      return;
    }
    try {
      this.connection.sendMedia(chunk);
    } catch (error) {
      const message = publicErrorMessage(error);
      console.error("[deepgram] failed to send audio", message);
      if (this.sender) {
        this.fail(this.sender, `Failed to send audio to Deepgram. ${message}`);
      }
    }
  }

  private async dispose(): Promise<void> {
    const connection = this.connection;
    this.abort?.abort();
    this.abort = null;
    this.queue = [];
    this.connection = null;

    if (!connection) {
      this.opened = false;
      this.closing = false;
      return;
    }

    this.closing = true;

    try {
      if (this.opened) {
        connection.sendFinalize({ type: "Finalize" });
        connection.sendCloseStream({ type: "CloseStream" });
        await Promise.race([
          new Promise<void>((resolve) => {
            connection.on("close", () => resolve());
          }),
          new Promise<void>((resolve) => {
            setTimeout(resolve, 2000);
          }),
        ]);
      }
    } catch (error) {
      console.error("[deepgram] error while closing", publicErrorMessage(error));
    } finally {
      try {
        connection.close();
      } catch {
        // Already closed.
      }
      this.opened = false;
      this.closing = false;
    }
  }

  private setStatus(status: TranscriptionStatus): void {
    this.status = status;
    emit(this.sender, { type: "status", status });
  }

  private fail(sender: WebContents, message: string): void {
    this.status = "error";
    emit(sender, { type: "status", status: "error" });
    emit(sender, { type: "error", message });
  }
}

export const deepgramLiveSession = new DeepgramLiveSession();
