// Run against a development instance: npm start -- --remote-debugging-port=9222
// Exercises a real transfer with a unique local filename; removes only its own history and file.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
const port = Number(process.env.TURBODM_DEBUG_PORT || 9222);
const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = pages.find(
  (p) => p.type === "page" && p.url.endsWith("/src/renderer/index.html"),
);
assert(
  page,
  "Start TurboDM with --remote-debugging-port=9222 before running this test",
);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let sequence = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  }
};
async function command(method, params = {}) {
  const id = ++sequence;
  const response = new Promise((resolve) => pending.set(id, resolve));
  socket.send(JSON.stringify({ id, method, params }));
  const message = await response;
  assert(!message.error, JSON.stringify(message.error));
  return message.result;
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

const payload = Buffer.alloc(2 * 1024 * 1024, 73);
const server = http.createServer((req, res) => {
  const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
  const start = match ? Number(match[1]) : 0,
    end = match && match[2] ? Number(match[2]) : payload.length - 1;
  const headers = {
    "Content-Length": end - start + 1,
    "Accept-Ranges": "bytes",
    "Content-Type": "application/octet-stream",
  };
  if (match)
    headers["Content-Range"] = `bytes ${start}-${end}/${payload.length}`;
  res.writeHead(match ? 206 : 200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  let offset = start;
  const timer = setInterval(() => {
    if (offset > end) {
      clearInterval(timer);
      res.end();
      return;
    }
    const next = Math.min(offset + 8192, end + 1);
    res.write(payload.subarray(offset, next));
    offset = next;
  }, 8);
  res.on("close", () => clearInterval(timer));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/turbodm-ui-${Date.now()}.bin`;
let item;
async function waitFor(status) {
  for (let i = 0; i < 150; i++) {
    item = await evaluate(`downloads.find(d=>d.url===${JSON.stringify(url)})`);
    if (item?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected ${status}, received ${JSON.stringify(item)}`);
}
try {
  await evaluate(
    `(async()=>{showAddModal();$inputUrl.value=${JSON.stringify(url)};await analyzeUrl($inputUrl.value);$inputConnections.value='1';document.getElementById('input-transfer-mode').value='single';await startDownload()})()`,
  );
  await waitFor("downloading");
  assert.equal(
    await evaluate("document.getElementById('modal-add').style.display"),
    "none",
  );
  await evaluate(
    `document.querySelector('[data-id="${item.id}"] [data-action=pause]').click()`,
  );
  await waitFor("paused");
  await evaluate(
    `document.querySelector('[data-id="${item.id}"] [data-action=resume]').click()`,
  );
  await waitFor("completed");
  assert.deepEqual(await fs.readFile(item.savePath), payload);
  await evaluate(
    `document.querySelector('[data-id="${item.id}"] [data-action=cancel]').click()`,
  );
  for (let i = 0; i < 20; i++) {
    if (!(await evaluate(`downloads.some(d=>d.id==='${item.id}')`))) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await evaluate(`downloads.some(d=>d.id==='${item.id}')`), false);
  assert.deepEqual(await fs.readFile(item.savePath), payload);
  console.log(
    "PASS: new dialog analysis → download → pause → resume → complete; all 2 MiB verified; removing history preserves file",
  );
} finally {
  if (item) {
    await evaluate(`window.tdm.cancelDownload('${item.id}')`);
    await fs.rm(item.savePath, { force: true });
  }
  server.close();
  socket.close();
}
