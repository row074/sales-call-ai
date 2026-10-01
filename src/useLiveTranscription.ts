import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptionEvent, TranscriptionStatus } from "./transcriptionTypes";

export type { TranscriptionStatus };

type LiveTranscriptionOptions = {
  onFinalTranscript?: (text: string) => void;
};

function transcriptionApi() {
  return window.salesCallAi;
}

export function useLiveTranscription(options: LiveTranscriptionOptions = {}) {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const api = transcriptionApi();
    if (!api) {
      setStatus("error");
      setError("Transcription bridge is unavailable.");
      return;
    }

    return api.onTranscriptionEvent((event: TranscriptionEvent) => {
      if (event.type === "status") {
        setStatus(event.status);
        return;
      }
      if (event.type === "error") {
        setStatus("error");
        setError(event.message);
        return;
      }
      if (event.isFinal) {
        setFinalText((current) => {
          const next = current ? `${current} ${event.text}` : event.text;
          return next.trim();
        });
        setInterimText("");
        optionsRef.current.onFinalTranscript?.(event.text);
        return;
      }
      setInterimText(event.text);
    });
  }, []);

  const start = useCallback(async (mimeType: string) => {
    const api = transcriptionApi();
    if (!api) {
      setStatus("error");
      setError("Transcription bridge is unavailable.");
      return;
    }

    setError(null);
    setInterimText("");
    setFinalText("");
    setStatus("connecting");

    const result = await api.startTranscription({ mimeType });
    if (!result.ok) {
      setStatus("error");
      setError(result.message ?? "Deepgram connection failed.");
    }
  }, []);

  const sendAudio = useCallback((chunk: ArrayBuffer) => {
    transcriptionApi()?.sendAudio(chunk);
  }, []);

  const stop = useCallback(async () => {
    await transcriptionApi()?.stopTranscription();
  }, []);

  return {
    status,
    error,
    interimText,
    finalText,
    start,
    sendAudio,
    stop,
  };
}
