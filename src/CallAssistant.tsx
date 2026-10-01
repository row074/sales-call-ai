import { useLiveTranscription } from "./useLiveTranscription";
import { useMicrophoneRecorder, type RecordingStatus } from "./useMicrophoneRecorder";
import { useSuggestedResponse } from "./useSuggestedResponse";
import { useUsage } from "./useUsage";
import type { SuggestionStatus } from "./suggestionTypes";
import type { TranscriptionStatus } from "./transcriptionTypes";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusLabel(status: RecordingStatus): string {
  switch (status) {
    case "recording":
      return "Recording";
    case "stopped":
      return "Stopped";
    default:
      return "Idle";
  }
}

function transcriptionStatusLabel(status: TranscriptionStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting to Deepgram";
    case "listening":
      return "Listening";
    case "transcribing":
      return "Transcribing";
    case "error":
      return "Error";
    default:
      return "Not connected";
  }
}

function suggestionStatusLabel(status: SuggestionStatus): string {
  switch (status) {
    case "generating":
      return "Generating";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    default:
      return "Waiting";
  }
}

type CallAssistantProps = {
  email: string;
  onSignOut: () => Promise<void>;
};

export function CallAssistant({ email, onSignOut }: CallAssistantProps) {
  const usage = useUsage();
  const suggestion = useSuggestedResponse({
    reserveUsage: usage.reserve,
  });
  const transcription = useLiveTranscription({
    onFinalTranscript: (text) => suggestion.considerFinal(text),
  });
  const { status, error, elapsedMs, startRecording, stopRecording } = useMicrophoneRecorder({
    onRecordingStarted: async (mimeType) => {
      suggestion.start();
      await transcription.start(mimeType);
    },
    onAudioChunk: (chunk) => transcription.sendAudio(chunk),
    onRecordingStopped: async () => {
      await transcription.stop();
      suggestion.stop();
    },
  });
  const isRecording = status === "recording";

  const handleSignOut = async () => {
    await stopRecording();
    await transcription.stop();
    suggestion.stop();
    await onSignOut();
  };

  return (
    <main className="app">
      <h1>Sales Call AI Assistant</h1>

      <div className="session-bar">
        <p className="session-email">
          Signed in as <strong>{email}</strong>
        </p>
        <button type="button" onClick={() => void handleSignOut()}>
          Sign Out
        </button>
      </div>

      <section className="recorder" aria-label="Microphone recording">
        <p className="recorder-status">
          Status: <strong>{statusLabel(status)}</strong>
        </p>

        {isRecording ? (
          <p className="recorder-timer" aria-live="polite">
            Recording time: {formatElapsed(elapsedMs)}
          </p>
        ) : null}

        <div className="recorder-actions">
          <button type="button" onClick={() => void startRecording()} disabled={isRecording}>
            Start Recording
          </button>
          <button type="button" onClick={() => void stopRecording()} disabled={!isRecording}>
            Stop Recording
          </button>
        </div>

        {error ? (
          <p className="recorder-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="transcript" aria-label="Live transcription">
        <p className="transcript-status">
          Transcription: <strong>{transcriptionStatusLabel(transcription.status)}</strong>
        </p>

        <div className="transcript-panel">
          <p className="transcript-final">
            {transcription.finalText || "Final transcript will appear here."}
          </p>
          {transcription.interimText ? (
            <p className="transcript-interim">{transcription.interimText}</p>
          ) : null}
        </div>

        {transcription.error ? (
          <p className="recorder-error" role="alert">
            {transcription.error}
          </p>
        ) : null}
      </section>

      <section className="suggestion" aria-label="Suggested response">
        <p className="suggestion-status">
          Suggested Response: <strong>{suggestionStatusLabel(suggestion.status)}</strong>
        </p>
        <p className="usage-status">
          Usage today: <strong>{usage.used} / {usage.limit}</strong>
        </p>
        {usage.limited ? (
          <p className="usage-limit" role="status">
            {usage.limitMessage}
          </p>
        ) : null}
        {usage.loadError ? (
          <p className="recorder-error" role="alert">
            {usage.loadError}
          </p>
        ) : null}
        <div className="suggestion-panel">
          <p className={suggestion.status === "generating" ? "suggestion-text generating" : "suggestion-text"}>
            {suggestion.text ||
              (suggestion.status === "generating"
                ? "Generating a reply..."
                : "A suggested reply will appear here.")}
          </p>
        </div>
        {suggestion.error ? (
          <p className="recorder-error" role="alert">
            {suggestion.error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
