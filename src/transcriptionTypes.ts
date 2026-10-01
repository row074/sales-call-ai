export type TranscriptionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "transcribing"
  | "error";

export type TranscriptionEvent =
  | { type: "status"; status: TranscriptionStatus }
  | { type: "transcript"; text: string; isFinal: boolean }
  | { type: "error"; message: string };
