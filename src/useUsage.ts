import { FirebaseError } from "firebase/app";
import { useCallback, useEffect, useState } from "react";
import {
  LIMIT_REACHED_MESSAGE,
  UsageLimitError,
  dailySuggestionLimit,
  loadTodayUsage,
  readUsageDocument,
  reserveSuggestionUsage,
  usageErrorMessage,
  type DailyUsage,
} from "./usageLimits";

const emptyUsage = (): DailyUsage => ({ used: 0, limit: dailySuggestionLimit() });

export function useUsage() {
  const [usage, setUsage] = useState<DailyUsage>(emptyUsage);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUsage(emptyUsage());
    setLoadError(null);
    void loadTodayUsage()
      .then((next) => {
        if (!cancelled) {
          setUsage(next);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(usageErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const previous = (window as Window & { __tryReadUsage?: unknown }).__tryReadUsage;
    (window as Window & { __tryReadUsage?: (uid: string) => Promise<unknown> }).__tryReadUsage = async (uid: string) => {
      try {
        const result = await readUsageDocument(uid);
        return { ok: true, result };
      } catch (error) {
        const code = error instanceof FirebaseError ? error.code : "unknown";
        return { ok: false, code };
      }
    };
    return () => {
      (window as Window & { __tryReadUsage?: unknown }).__tryReadUsage = previous;
    };
  }, []);

  const reserve = useCallback(async (): Promise<DailyUsage> => {
    try {
      const next = await reserveSuggestionUsage();
      setUsage(next);
      setLoadError(null);
      return next;
    } catch (error) {
      if (error instanceof UsageLimitError) {
        setUsage((current) => ({ ...current, used: current.limit }));
      }
      throw error;
    }
  }, []);

  return {
    used: usage.used,
    limit: usage.limit,
    limited: usage.used >= usage.limit && usage.limit > 0,
    loadError,
    limitMessage: LIMIT_REACHED_MESSAGE,
    reserve,
  };
}
