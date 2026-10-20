/**
 * Headless smoke test using the Chrome DevTools Protocol.
 *
 * Usage: node scripts/browser-check.mjs [url]
 *
 * Loads the app with a fake camera, waits, then reports console errors,
 * page exceptions, DOM state and writes a screenshot to artifacts/.
 */
import { spawn } from "node:child_process";
import { mkdir, open, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const URL_TO_CHECK = process.argv[2] || "http://localhost:5173/";
const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9333;

const messages = [];
const exceptions = [];

async function getWebSocketUrl() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      const json = await res.json();
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch {
      // Chrome not up yet
    }
    await sleep(200);
  }
  throw new Error("Chrome DevTools endpoint never became available");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", reject);
  });
}

function makeClient(ws) {
  let nextId = 1;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);

    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
      return;
    }

    if (data.method === "Runtime.consoleAPICalled") {
      const text = (data.params.args || [])
        .map((arg) => arg.value ?? arg.description ?? arg.type)
        .join(" ");
      messages.push({ level: data.params.type, text });
    }

    if (data.method === "Runtime.exceptionThrown") {
      const details = data.params.exceptionDetails;
      exceptions.push(
        details.exception?.description ||
          details.text ||
          "Unknown page exception"
      );
    }

    if (data.method === "Log.entryAdded") {
      messages.push({
        level: data.params.entry.level,
        text: data.params.entry.text,
      });
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  return { send };
}

// A fresh profile per run avoids "Chrome is already running" singleton locks.
const profileDir = path.resolve(
  `artifacts/chrome-profile-${process.pid}-${Date.now()}`
);
await mkdir(profileDir, { recursive: true });
await mkdir(path.resolve("artifacts"), { recursive: true });
const chromeLog = await open(path.resolve("artifacts/chrome.log"), "w");

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: ["ignore", chromeLog.fd, chromeLog.fd] }
);

let exitCode = 0;

try {
  const wsUrl = await getWebSocketUrl();
  const ws = await connect(wsUrl);
  const client = makeClient(ws);

  const { targetId } = await client.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  await client.send("Runtime.enable", {}, sessionId);
  await client.send("Log.enable", {}, sessionId);
  await client.send("Page.enable", {}, sessionId);
  await client.send("Page.navigate", { url: URL_TO_CHECK }, sessionId);
  await sleep(6000);

  const bodyText = await client.send(
    "Runtime.evaluate",
    {
      expression: "document.body.innerText.slice(0, 1500)",
      returnByValue: true,
    },
    sessionId
  );
  const rootChildren = await client.send(
    "Runtime.evaluate",
    {
      expression:
        "document.getElementById('root') ? document.getElementById('root').children.length : -1",
      returnByValue: true,
    },
    sessionId
  );
  const title = await client.send(
    "Runtime.evaluate",
    { expression: "document.title", returnByValue: true },
    sessionId
  );

  const screenshot = await client.send(
    "Page.captureScreenshot",
    { format: "png" },
    sessionId
  );
  await writeFile(
    path.resolve("artifacts/app.png"),
    Buffer.from(screenshot.data, "base64")
  );

  // --- Second scenario: start the (fake) camera and let the model load ----
  await client.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const button = [...document.querySelectorAll('button')].find((b) =>
          b.textContent.trim().toLowerCase().includes('start camera')
        );
        if (!button) return 'no-start-button';
        button.click();
        return 'clicked';
      })()`,
      returnByValue: true,
    },
    sessionId
  );

  await sleep(15000);

  const liveText = await client.send(
    "Runtime.evaluate",
    {
      expression: "document.body.innerText.slice(0, 1500)",
      returnByValue: true,
    },
    sessionId
  );

  const liveShot = await client.send(
    "Page.captureScreenshot",
    { format: "png" },
    sessionId
  );
  await writeFile(
    path.resolve("artifacts/app-camera.png"),
    Buffer.from(liveShot.data, "base64")
  );

  const visibleText = bodyText.result.value || "";

  console.log("--- TITLE ---");
  console.log(title.result.value);
  console.log("--- ROOT CHILD COUNT ---");
  console.log(rootChildren.result.value);
  console.log("--- VISIBLE TEXT (first 800 chars) ---");
  console.log(visibleText.slice(0, 800));
  console.log("--- CONSOLE MESSAGES ---");
  messages.forEach((m) => console.log(`[${m.level}] ${m.text}`));
  console.log("--- PAGE EXCEPTIONS ---");
  exceptions.forEach((e) => console.log(e));
  console.log("--- SCREENSHOT --- artifacts/app.png, artifacts/app-camera.png");
  console.log("--- AFTER CAMERA START (first 800 chars) ---");
  console.log((liveText.result.value || "").slice(0, 800));

  const hasAppContent = visibleText.includes("Soma");
  const fatal = exceptions.length > 0;
  const modelReady = !(liveText.result.value || "").includes("loading");
  if (!hasAppContent || fatal || rootChildren.result.value < 1 || !modelReady) {
    exitCode = 1;
  }

  ws.close();
} catch (error) {
  console.error("Smoke test failed:", error);
  exitCode = 1;
} finally {
  chrome.kill();
}

process.exit(exitCode);
