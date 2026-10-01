import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { FirebaseConfigError, getFirebaseAuth, isFirebaseConfigured } from "./firebase";

export type AuthUser = {
  uid: string;
  email: string | null;
};

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
  };
}

function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseConfigError) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-email":
      case "auth/missing-email":
        return "Enter a valid email address.";
      case "auth/missing-password":
        return "Enter a password.";
      case "auth/weak-password":
        return "Choose a stronger password. Use at least 6 characters.";
      case "auth/email-already-in-use":
        return "An account with this email already exists. Sign in instead.";
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Incorrect email or password.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again later.";
      case "auth/network-request-failed":
        return "Could not reach Firebase. Check your network connection.";
      case "auth/operation-not-allowed":
        return "Email/password sign-in is not enabled for this Firebase project.";
      default:
        return "Authentication failed. Try again.";
    }
  }

  return "Authentication failed. Try again.";
}

export function useAuth() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      setReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (next) => {
      setUser(next ? toAuthUser(next) : null);
      setReady(true);
    });

    return unsubscribe;
  }, []);

  const createAccount = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Enter a valid email address.");
        return;
      }
      if (!password) {
        setError("Enter a password.");
        return;
      }
      await createUserWithEmailAndPassword(getFirebaseAuth(), trimmedEmail, password);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Enter a valid email address.");
        return;
      }
      if (!password) {
        setError("Enter a password.");
        return;
      }
      await signInWithEmailAndPassword(getFirebaseAuth(), trimmedEmail, password);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!isFirebaseConfigured()) {
        setUser(null);
        return;
      }
      await firebaseSignOut(getFirebaseAuth());
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    ready,
    user,
    busy,
    error,
    configured: isFirebaseConfigured(),
    createAccount,
    signIn,
    signOut,
  };
}
