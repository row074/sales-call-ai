import { spawn } from "node:child_process";

const DEV_SERVER_URL = "http://127.0.0.1:5173";

function run(command, args, extraEnv = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
}

function runToExit(command, args) {
  return new Promise((resolve, reject) => {
    const child = run(command, args);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
      }
    });
  });
}

async function waitForDevServer() {
  for (;;) {
    try {
      await fetch(DEV_SERVER_URL, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

await runToExit("npx", ["tsc", "-p", "electron/tsconfig.json"]);
await runToExit("npx", ["tsc", "-p", "electron/tsconfig.preload.json"]);

const electronArgs = ["."];
if (process.env.ELECTRON_REMOTE_DEBUGGING_PORT) {
  electronArgs.push(`--remote-debugging-port=${process.env.ELECTRON_REMOTE_DEBUGGING_PORT}`);
}

const vite = run("npx", ["vite"]);
await waitForDevServer();

const electronProcess = run("npx", ["electron", ...electronArgs], {
  VITE_DEV_SERVER_URL: DEV_SERVER_URL,
});

const shutdown = () => {
  vite.kill();
  electronProcess.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

electronProcess.on("exit", () => {
  vite.kill();
  process.exit(0);
});
