import { useCallback, useEffect, useRef, useState } from "react";
import type { SuggestionEvent, SuggestionStatus } from "./suggestionTypes";
import { LIMIT_REACHED_MESSAGE, UsageLimitError, usageErrorMessage } from "./usageLimits";

const DEBOUNCE_MS = 750;
const QUESTION_DEBOUNCE_MS = 150;
const MAX_UTTERANCES = 12;
const MIN_CHARS = 24;
const MIN_WORDS = 5;
const FILLER = new Set(["yeah", "yes", "yep", "no", "nah", "ok", "okay", "uh", "um", "hmm", "mm", "mhm", "right", "sure", "thanks"]);

function suggestionApi() {
  return window.salesCallAi;
}

function isMeaningful(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return false;
  }
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 0) {
    return false;
  }
  if (words.every((word) => FILLER.has(word.toLowerCase().replace(/[^\p{L}]/gu, "")))) {
    return false;
  }
  return cleaned.length >= MIN_CHARS || words.length >= MIN_WORDS;
}

type SuggestedResponseOptions = {
  reserveUsage?: () => Promise<unknown>;
};

export function useSuggestedResponse(options: SuggestedResponseOptions = {}) {
  const [status, setStatus] = useState<SuggestionStatus>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utterancesRef = useRef<string[]>([]);
  const pendingRef = useRef("");
  const lastRequestedRef = useRef("");
  const debounceRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const reservingRef = useRef(false);
  const reserveUsageRef = useRef(options.reserveUsage);
  reserveUsageRef.current = options.reserveUsage;

  useEffect(() => {
    const api = suggestionApi();
    if (!api?.onSuggestionEvent) {
      return;
    }

    return api.onSuggestionEvent((event: SuggestionEvent) => {
      if (event.type === "reset") {
        setStatus("idle");
        setText("");
        setError(null);
        return;
      }
      if (event.type === "status") {
        setStatus(event.status);
        if (event.status === "generating") {
          setText("");
          setError(null);
        }
        return;
      }
      if (event.type === "delta") {
        if (event.text) {
          setStatus("generating");
          setText((current) => current + event.text);
        }
        return;
      }
      if (event.type === "done") {
        setStatus("ready");
        return;
      }
      setStatus("error");
      setError(event.message);
    });
  }, []);

  const clearDebounce = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    activeRef.current = true;
    utterancesRef.current = [];
    pendingRef.current = "";
    lastRequestedRef.current = "";
    clearDebounce();
    setStatus("idle");
    setText("");
    setError(null);
    void suggestionApi()?.cancelSuggestion();
  }, [clearDebounce]);

  const stop = useCallback(() => {
    activeRef.current = false;
    pendingRef.current = "";
    clearDebounce();
    void suggestionApi()?.cancelSuggestion();
    setStatus("idle");
    setText("");
    setError(null);
  }, [clearDebounce]);

  const flush = useCallback(() => {
    if (!activeRef.current || reservingRef.current) {
      return;
    }
    const utterance = pendingRef.current.replace(/\s+/g, " ").trim();
    pendingRef.current = "";
    if (!isMeaningful(utterance) || utterance === lastRequestedRef.current) {
      return;
    }

    const api = suggestionApi();
    if (!api?.generateSuggestion) {
      setStatus("error");
      setError("Suggestion bridge is unavailable.");
      return;
    }

    const history = [...utterancesRef.current, utterance].slice(-MAX_UTTERANCES);
    const reserveUsage = reserveUsageRef.current;
    if (!reserveUsage) {
      utterancesRef.current = history;
      lastRequestedRef.current = utterance;
      setStatus("generating");
      setText("");
      setError(null);
      void api.generateSuggestion({ utterances: history });
      return;
    }

    reservingRef.current = true;
    setStatus("generating");
    setText("");
    setError(null);

    void reserveUsage()
      .then(() => {
        if (!activeRef.current) {
          return;
        }
        utterancesRef.current = history;
        lastRequestedRef.current = utterance;
        void api.generateSuggestion({ utterances: history });
      })
      .catch((caught: unknown) => {
        if (!activeRef.current) {
          return;
        }
        if (caught instanceof UsageLimitError) {
          lastRequestedRef.current = utterance;
          setStatus("error");
          setError(LIMIT_REACHED_MESSAGE);
          return;
        }
        setStatus("error");
        setError(usageErrorMessage(caught));
      })
      .finally(() => {
        reservingRef.current = false;
        if (activeRef.current && pendingRef.current) {
          flush();
        }
      });
  }, []);

  const considerFinal = useCallback(
    (textChunk: string) => {
      if (!activeRef.current) {
        return;
      }
      const cleaned = textChunk.replace(/\s+/g, " ").trim();
      if (!cleaned) {
        return;
      }
      pendingRef.current = pendingRef.current ? `${pendingRef.current} ${cleaned}` : cleaned;
      clearDebounce();
      const waitMs = /[?]$/.test(pendingRef.current) ? QUESTION_DEBOUNCE_MS : DEBOUNCE_MS;
      debounceRef.current = window.setTimeout(() => {
        flush();
      }, waitMs);
    },
    [clearDebounce, flush],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const onTestFinal = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      if (typeof text === "string") {
        considerFinal(text);
      }
    };
    window.addEventListener("sales-call-ai:test-final", onTestFinal);
    return () => {
      window.removeEventListener("sales-call-ai:test-final", onTestFinal);
    };
  }, [considerFinal]);

  return {
    status,
    text,
    error,
    start,
    stop,
    considerFinal,
  };
}
