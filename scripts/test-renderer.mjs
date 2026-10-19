// Run against a development instance: npm start -- --remote-debugging-port=9222
// Uses renderer-only fixtures; never changes persisted downloads or preferences.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
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
let passed = 0;
function pass(name) {
  console.log(`PASS ${++passed}: ${name}`);
}
const fixtures = [
  {
    id: "ui-video",
    fileName: "Coastline — a short film.mp4",
    url: "https://media.example.com/coastline.mp4",
    status: "downloading",
    fileSize: 800 * 1024 ** 2,
    downloadedBytes: 487 * 1024 ** 2,
    progress: 60.9,
    speed: 12.4 * 1024 ** 2,
    eta: 25,
    connections: 16,
    activeConnections: 16,
    connectionMode: "parallel",
    __addedOrder: 4,
    chunks: Array.from({ length: 8 }, (_, i) => ({ progress: 35 + i * 8 })),
  },
  {
    id: "ui-archive",
    fileName: "Design resources.zip",
    url: "https://files.example.com/resources.zip",
    status: "paused",
    fileSize: 250 * 1024 ** 2,
    downloadedBytes: 85 * 1024 ** 2,
    progress: 34,
    connections: 8,
    connectionMode: "parallel",
    __addedOrder: 3,
  },
  {
    id: "ui-document",
    fileName: "Product brief.pdf",
    url: "https://docs.example.com/brief.pdf",
    status: "completed",
    fileSize: 4.8 * 1024 ** 2,
    downloadedBytes: 4.8 * 1024 ** 2,
    progress: 100,
    savePath: "/tmp/brief.pdf",
    __addedOrder: 2,
  },
  {
    id: "ui-failed",
    fileName: "Ambient collection.flac",
    url: "https://audio.example.com/ambient.flac",
    status: "failed",
    fileSize: 82 * 1024 ** 2,
    progress: 0,
    error: "Connection interrupted. Check the link and try again.",
    __addedOrder: 1,
  },
];
async function screenshot(name) {
  if (!process.env.TURBODM_SCREENSHOT_DIR) return;
  await fs.mkdir(process.env.TURBODM_SCREENSHOT_DIR, { recursive: true });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await command("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(
    path.join(process.env.TURBODM_SCREENSHOT_DIR, name + ".png"),
    Buffer.from(result.data, "base64"),
  );
}
try {
  await evaluate(
    `downloads = ${JSON.stringify(fixtures)}; currentFilter='all'; searchQuery=''; renderDownloads();`,
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.download-item').length"),
    4,
  );
  assert.equal(
    await evaluate("document.getElementById('metric-active').textContent"),
    "1",
  );
  assert.equal(
    await evaluate("document.getElementById('metric-completed').textContent"),
    "1",
  );
  assert.equal(
    await evaluate("document.querySelector('[data-count=paused]').textContent"),
    "1",
  );
  pass("all transfer states and live counters render");
  await evaluate("document.querySelector('[data-filter=paused]').click()");
  assert.equal(
    await evaluate("document.querySelectorAll('.download-item').length"),
    1,
  );
  assert.equal(
    await evaluate("document.querySelector('.download-item').dataset.id"),
    "ui-archive",
  );
  await evaluate("document.querySelector('[data-filter=failed]').click()");
  assert.equal(
    await evaluate("document.querySelector('.download-item').dataset.id"),
    "ui-failed",
  );
  await evaluate("document.querySelector('[data-filter=video]').click()");
  assert.equal(
    await evaluate("document.querySelector('.download-item').dataset.id"),
    "ui-video",
  );
  pass("status and category filters are independent");
  await evaluate(
    "document.querySelector('[data-filter=all]').click(); document.getElementById('search-input').value='no match'; document.getElementById('search-input').dispatchEvent(new Event('input'))",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.download-item').length"),
    0,
  );
  assert.equal(
    await evaluate(
      "document.getElementById('empty-state').isConnected && getComputedStyle(document.getElementById('empty-state')).display !== 'none'",
    ),
    true,
  );
  await evaluate(
    "document.getElementById('search-input').value=''; document.getElementById('search-input').dispatchEvent(new Event('input'))",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.download-item').length"),
    4,
  );
  pass("empty search state survives populated list and recovers");
  await evaluate(
    "document.getElementById('sort-order').value='name'; document.getElementById('sort-order').dispatchEvent(new Event('change'))",
  );
  assert.equal(
    await evaluate("document.querySelector('.download-item').dataset.id"),
    "ui-failed",
  );
  await evaluate(
    "document.getElementById('sort-order').value='size'; document.getElementById('sort-order').dispatchEvent(new Event('change'))",
  );
  assert.equal(
    await evaluate("document.querySelector('.download-item').dataset.id"),
    "ui-video",
  );
  pass("name and size sorting");
  await evaluate(
    "updateDownloadInPlace({...downloads[0],progress:75,activeConnections:8,connectionMode:'single',speed:3*1024**2})",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-id=ui-video] [role=progressbar]').getAttribute('aria-valuenow')",
    ),
    "75",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-id=ui-video] [data-action=mode]').dataset.mode",
    ),
    "parallel",
  );
  pass("live progress and connection mode updates");
  await evaluate(
    "document.getElementById('btn-add').focus(); document.getElementById('btn-add').click(); document.getElementById('input-url').value='javascript:alert(1)'; startDownload()",
  );
  assert.equal(
    await evaluate("document.getElementById('add-error').hidden"),
    false,
  );
  assert.equal(
    await evaluate("document.querySelector('.app-shell').inert"),
    true,
  );
  assert.equal(await evaluate("document.activeElement.id"), "input-url");
  await evaluate("document.getElementById('btn-start-download').focus()");
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  assert.equal(await evaluate("document.activeElement.id"), "modal-add-close");
  await screenshot("new-download");
  await evaluate("document.getElementById('modal-add-close').click()");
  assert.equal(await evaluate("document.activeElement.id"), "btn-add");
  assert.equal(
    await evaluate("document.querySelector('.app-shell').inert"),
    false,
  );
  pass("URL validation, modal focus trap and focus restoration");
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "k",
    code: "KeyK",
    modifiers: 2,
    windowsVirtualKeyCode: 75,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "k",
    code: "KeyK",
    modifiers: 2,
    windowsVirtualKeyCode: 75,
  });
  assert.equal(await evaluate("document.activeElement.id"), "search-input");
  pass("Ctrl K search shortcut");
  await evaluate(
    `downloads.push({id:'ui-escape',fileName:'<img src=x onerror="window.__injected=true">.zip',url:'https://example.com',status:'failed',error:'<script>bad</script>'});renderDownloads()`,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-id=ui-escape] img') === null && !window.__injected",
    ),
    true,
  );
  await evaluate(
    "downloads=downloads.filter(d=>d.id !== 'ui-escape');renderDownloads()",
  );
  pass("untrusted filenames and errors render as text");
  await evaluate("document.documentElement.dataset.theme='light'");
  await screenshot("downloads-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await screenshot("downloads-dark");
  for (const [width, height] of [
    [800, 600],
    [1180, 800],
  ]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      true,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.sidebar-version').getBoundingClientRect().bottom <= innerHeight",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.library-controls').getBoundingClientRect().right <= innerWidth",
      ),
      true,
    );
    await screenshot(`downloads-${width}`);
  }
  pass("light/dark layouts fit 800×600 and 1180×800");
  await evaluate(
    "downloads=[];renderDownloads();document.documentElement.dataset.theme='light'",
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.getElementById('empty-state')).display !== 'none'",
    ),
    true,
  );
  await screenshot("empty-light");
  pass("empty library after last transfer is removed");
  console.log(`${passed} UI checks passed`);
} finally {
  await command("Emulation.clearDeviceMetricsOverride");
  await command("Page.reload", { ignoreCache: true });
  socket.close();
}
