export type SuggestionStatus = "idle" | "generating" | "ready" | "error";

export type SuggestionEvent =
  | { type: "status"; status: SuggestionStatus }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "reset" };

export type SuggestionRequestPayload = {
  utterances: string[];
};
