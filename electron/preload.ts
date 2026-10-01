import { contextBridge, ipcRenderer } from "electron";
import type { TranscriptionEvent } from "./transcriptionTypes.js";
import type { SuggestionEvent, SuggestionRequestPayload } from "./suggestionTypes.js";

contextBridge.exposeInMainWorld("salesCallAi", {
  startTranscription: (payload: { mimeType: string }) =>
    ipcRenderer.invoke("transcription:start", payload) as Promise<{
      ok: boolean;
      message?: string;
    }>,
  sendAudio: (chunk: ArrayBuffer) => {
    ipcRenderer.send("transcription:audio", chunk);
  },
  stopTranscription: () => ipcRenderer.invoke("transcription:stop") as Promise<void>,
  onTranscriptionEvent: (callback: (event: TranscriptionEvent) => void) => {
    const listener = (_ipcEvent: unknown, event: TranscriptionEvent) => {
      callback(event);
    };
    ipcRenderer.on("transcription:event", listener);
    return () => {
      ipcRenderer.removeListener("transcription:event", listener);
    };
  },
  generateSuggestion: (payload: SuggestionRequestPayload) =>
    ipcRenderer.invoke("suggestion:generate", payload) as Promise<{
      ok: boolean;
      message?: string;
    }>,
  cancelSuggestion: () => ipcRenderer.invoke("suggestion:cancel") as Promise<void>,
  onSuggestionEvent: (callback: (event: SuggestionEvent) => void) => {
    const listener = (_ipcEvent: unknown, event: SuggestionEvent) => {
      callback(event);
    };
    ipcRenderer.on("suggestion:event", listener);
    return () => {
      ipcRenderer.removeListener("suggestion:event", listener);
    };
  },
});
