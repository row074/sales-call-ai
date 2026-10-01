# Sales Call AI Assistant

Desktop application built with Electron, React, and TypeScript. After sign-in, it captures microphone audio, streams live transcription through Deepgram, and requests streamed suggested replies from OpenAI. Firebase Authentication and Firestore track per-user daily suggestion usage.

## Requirements

- Node.js 24

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

This starts the Vite renderer and opens the Electron desktop window.

## Deepgram live transcription

1. Copy `.env.example` to `.env`.
2. Replace `your_key_here` with your Deepgram API key.
3. Keep `.env` local. It is gitignored and must not be committed.
4. Restart the app after changing `.env`.

The key is loaded only in the Electron main process. It is not exposed to the React renderer.

## OpenAI suggested responses

1. Add `OPENAI_API_KEY` to your local `.env`.
2. Optionally set `OPENAI_MODEL` (default: `gpt-4.1-mini`).
3. Keep `.env` local. It is gitignored and must not be committed.
4. Restart the app after changing `.env`.

The OpenAI key is loaded only in the Electron main process. Finalized Deepgram transcripts trigger a streamed suggestion in the UI.

## Firebase Authentication

1. Create a Firebase project and enable Email/Password authentication.
2. Copy the web app configuration values into your local `.env` using the `VITE_FIREBASE_*` names from `.env.example`.
3. Restart the app after changing `.env`.

Firebase web configuration is used only in the React renderer. Deepgram and OpenAI keys stay in the Electron main process.

Per-user suggestion usage is stored in Firestore at `users/{uid}/usage/{YYYY-MM-DD}`. Deploy the repo rules after changing them:

```bash
npx firebase-tools deploy --only firestore:rules
```

## Build

```bash
npm run build
```

Compiles the React UI into `dist/` and the Electron main process into `dist-electron/`.
