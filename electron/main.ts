import { app, BrowserWindow, ipcMain, session, systemPreferences } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deepgramLiveSession } from "./deepgramSession.js";
import { latencyTracker } from "./latencyTracker.js";
import { suggestionSession } from "./suggestionSession.js";
import type { SuggestionRequestPayload } from "./suggestionTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLocalEnv(): void {
  const candidates = [path.join(process.cwd(), ".env"), path.join(app.getAppPath(), ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    process.loadEnvFile(file);
    return;
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 960,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "Sales Call AI Assistant",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function allowMicrophonePermission(): void {
  const appSession = session.defaultSession;

  appSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  appSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });
}

async function requestMacosMicrophoneAccess(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status !== "granted") {
    await systemPreferences.askForMediaAccess("microphone");
  }
}

function toArrayBuffer(chunk: unknown): ArrayBuffer | null {
  if (chunk instanceof ArrayBuffer) {
    return chunk;
  }
  if (ArrayBuffer.isView(chunk) || Buffer.isBuffer(chunk)) {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    return copy.buffer;
  }
  return null;
}

function registerTranscriptionIpc(): void {
  ipcMain.handle("transcription:start", async (event, payload: { mimeType?: string }) => {
    try {
      latencyTracker.reset();
      latencyTracker.mark("recordingStarted");
      await deepgramLiveSession.start(event.sender, payload?.mimeType ?? "");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deepgram connection failed.";
      return { ok: false, message };
    }
  });

  ipcMain.on("transcription:audio", (_event, chunk: unknown) => {
    const audio = toArrayBuffer(chunk);
    if (!audio) {
      return;
    }
    deepgramLiveSession.sendAudio(audio);
  });

  ipcMain.handle("transcription:stop", async () => {
    suggestionSession.cancel();
    await deepgramLiveSession.stop();
  });

  ipcMain.handle("suggestion:generate", (event, payload: SuggestionRequestPayload) => {
    const utterances = Array.isArray(payload?.utterances) ? payload.utterances : [];
    void suggestionSession.generate(event.sender, { utterances });
    return { ok: true };
  });

  ipcMain.handle("suggestion:cancel", () => {
    suggestionSession.cancel();
  });
}

app.whenReady().then(async () => {
  loadLocalEnv();
  allowMicrophonePermission();
  await requestMacosMicrophoneAccess();
  registerTranscriptionIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  suggestionSession.cancel();
  void deepgramLiveSession.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
