import { FirebaseError } from "firebase/app";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "./firebase";

export const DAILY_SUGGESTION_LIMIT = 50;
export const LIMIT_REACHED_MESSAGE = "Daily suggestion limit reached.";

export class UsageLimitError extends Error {
  constructor() {
    super(LIMIT_REACHED_MESSAGE);
    this.name = "UsageLimitError";
  }
}

export type DailyUsage = {
  used: number;
  limit: number;
};

export function dailySuggestionLimit(): number {
  const raw = Number.parseInt(String(import.meta.env.VITE_SUGGESTION_DAILY_LIMIT ?? ""), 10);
  if (Number.isInteger(raw) && raw >= 1 && raw <= DAILY_SUGGESTION_LIMIT) {
    return raw;
  }
  return DAILY_SUGGESTION_LIMIT;
}

export function usageDayId(at = new Date()): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function usageDocPath(uid: string, day = usageDayId()): string {
  return `users/${uid}/usage/${day}`;
}

function usageDocRef(db: Firestore, uid: string, day = usageDayId()) {
  return doc(db, "users", uid, "usage", day);
}

function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) {
    throw new Error("Sign in to generate suggested responses.");
  }
  return uid;
}

export function usageErrorMessage(error: unknown): string {
  if (error instanceof UsageLimitError) {
    return error.message;
  }
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "Could not access usage data for this account.";
    }
    if (error.code === "unavailable" || error.code === "deadline-exceeded") {
      return "Could not reach Firestore. Check your network connection.";
    }
  }
  return "Could not update usage. Try again.";
}

export async function readUsageDocument(uid: string, day = usageDayId()): Promise<DailyUsage | null> {
  const snapshot = await getDoc(usageDocRef(getFirebaseFirestore(), uid, day));
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  return {
    used: typeof data.suggestionsUsed === "number" ? data.suggestionsUsed : 0,
    limit: typeof data.dailyLimit === "number" ? data.dailyLimit : dailySuggestionLimit(),
  };
}
export async function loadTodayUsage(): Promise<DailyUsage> {
  const uid = requireUid();
  const limit = dailySuggestionLimit();
  const snapshot = await getDoc(usageDocRef(getFirebaseFirestore(), uid));
  if (!snapshot.exists()) {
    return { used: 0, limit };
  }
  const data = snapshot.data();
  const used = typeof data.suggestionsUsed === "number" ? data.suggestionsUsed : 0;
  const storedLimit = typeof data.dailyLimit === "number" ? data.dailyLimit : limit;
  return { used, limit: storedLimit };
}

export async function reserveSuggestionUsage(): Promise<DailyUsage> {
  const uid = requireUid();
  const db = getFirebaseFirestore();
  const ref = usageDocRef(db, uid);
  const fallbackLimit = dailySuggestionLimit();

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      transaction.set(ref, {
        suggestionsUsed: 1,
        dailyLimit: fallbackLimit,
        updatedAt: serverTimestamp(),
      });
      return { used: 1, limit: fallbackLimit };
    }

    const data = snapshot.data();
    const used = typeof data.suggestionsUsed === "number" ? data.suggestionsUsed : 0;
    const limit = typeof data.dailyLimit === "number" ? data.dailyLimit : fallbackLimit;
    if (used >= limit) {
      throw new UsageLimitError();
    }

    const next = used + 1;
    transaction.update(ref, {
      suggestionsUsed: next,
      updatedAt: serverTimestamp(),
    });
    return { used: next, limit };
  });
}
