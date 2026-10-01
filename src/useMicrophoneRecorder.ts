import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingStatus = "idle" | "recording" | "stopped";

type MicrophoneRecorderOptions = {
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  onRecordingStarted?: (mimeType: string) => void | Promise<void>;
  onRecordingStopped?: () => void | Promise<void>;
};

function microphoneErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return "Microphone access failed. Please try again.";
  }

  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone permission was denied. Allow microphone access to start recording.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found. Connect a microphone and try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "The microphone is in use or could not be read. Close other apps using it and try again.";
    case "OverconstrainedError":
      return "The available microphone does not meet the required audio settings.";
    case "SecurityError":
      return "Microphone access is blocked in this context.";
    default:
      return error.message || "Microphone access failed. Please try again.";
  }
}

function pickRecorderMimeType(): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useMicrophoneRecorder(options: MicrophoneRecorderOptions = {}) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const optionsRef = useRef(options);
  const chunkQueueRef = useRef(Promise.resolve());
  optionsRef.current = options;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
  }, []);

  const stopRecorder = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (!recorder || recorder.state === "inactive") {
      await chunkQueueRef.current;
      return;
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });
    await chunkQueueRef.current;
  }, []);

  const releaseRecordingResources = useCallback(async () => {
    clearTimer();
    await stopRecorder();
    stopMediaTracks();
    await optionsRef.current.onRecordingStopped?.();
  }, [clearTimer, stopMediaTracks, stopRecorder]);

  useEffect(() => {
    return () => {
      void releaseRecordingResources();
    };
  }, [releaseRecordingResources]);

  const startRecording = useCallback(async () => {
    if (startingRef.current || recorderRef.current?.state === "recording") {
      return;
    }

    startingRef.current = true;
    setError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture is not supported in this window.");
      }

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Audio recording is not supported in this window.");
      }

      await releaseRecordingResources();
      chunksRef.current = [];
      chunkQueueRef.current = Promise.resolve();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size <= 0) {
          return;
        }
        chunksRef.current.push(event.data);
        chunkQueueRef.current = chunkQueueRef.current
          .then(async () => {
            const buffer = await event.data.arrayBuffer();
            optionsRef.current.onAudioChunk?.(buffer);
          })
          .catch((sendError: unknown) => {
            console.error("[transcription] failed to send audio", sendError);
          });
      };

      void optionsRef.current.onRecordingStarted?.(recorder.mimeType);
      recorder.start(250);
      recorderRef.current = recorder;

      const startedAt = Date.now();
      setElapsedMs(0);
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAt);
      }, 250);
    } catch (caught) {
      await releaseRecordingResources();
      setStatus("idle");
      setElapsedMs(0);
      setError(microphoneErrorMessage(caught));
    } finally {
      startingRef.current = false;
    }
  }, [releaseRecordingResources]);

  const stopRecording = useCallback(async () => {
    if (recorderRef.current?.state !== "recording" && !streamRef.current) {
      return;
    }

    await releaseRecordingResources();
    setStatus("stopped");
  }, [releaseRecordingResources]);

  return {
    status,
    error,
    elapsedMs,
    startRecording,
    stopRecording,
  };
}
