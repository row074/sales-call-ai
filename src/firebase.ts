import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

export class FirebaseConfigError extends Error {
  constructor(message = "Firebase is not configured. Add the VITE_FIREBASE_* values to your local .env and restart the app.") {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readEnv(name: string): string {
  return String(import.meta.env[name] ?? "").trim();
}

function readFirebaseConfig(): FirebaseWebConfig | null {
  const config = {
    apiKey: readEnv("VITE_FIREBASE_API_KEY"),
    authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readEnv("VITE_FIREBASE_APP_ID"),
  };

  if (Object.values(config).some((value) => value.length === 0)) {
    return null;
  }

  return config;
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfig() !== null;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) {
    return app;
  }

  const config = readFirebaseConfig();
  if (!config) {
    throw new FirebaseConfigError();
  }

  app = getApps().length > 0 ? getApp() : initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) {
    return auth;
  }
  auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  if (firestore) {
    return firestore;
  }

  const firebaseApp = getFirebaseApp();
  try {
    firestore = initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
    });
  } catch {
    firestore = getFirestore(firebaseApp);
  }
  return firestore;
}
