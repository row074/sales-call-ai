/// <reference types="vite/client" />

import type { SuggestionEvent, SuggestionRequestPayload } from "./suggestionTypes";
import type { TranscriptionEvent } from "./transcriptionTypes";

interface SalesCallAiBridge {
  startTranscription: (payload: { mimeType: string }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  sendAudio: (chunk: ArrayBuffer) => void;
  stopTranscription: () => Promise<void>;
  onTranscriptionEvent: (callback: (event: TranscriptionEvent) => void) => () => void;
  generateSuggestion: (payload: SuggestionRequestPayload) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  cancelSuggestion: () => Promise<void>;
  onSuggestionEvent: (callback: (event: SuggestionEvent) => void) => () => void;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY?: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
    readonly VITE_FIREBASE_PROJECT_ID?: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
    readonly VITE_FIREBASE_APP_ID?: string;
    readonly VITE_SUGGESTION_DAILY_LIMIT?: string;
  }

  interface Window {
    salesCallAi?: SalesCallAiBridge;
  }
}

export {};
