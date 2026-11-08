// Run against a test instance started with --remote-debugging-port=9222.
// TURBODM_TEST_USER_DATA must match that instance's --user-data-dir.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const userData = process.env.TURBODM_TEST_USER_DATA;
assert(userData, 'Set TURBODM_TEST_USER_DATA to the running test app profile');
const pages = await (await fetch(`http://127.0.0.1:${process.env.TURBODM_DEBUG_PORT || 9222}/json`)).json();
const page = pages.find(p => p.url.endsWith('/src/renderer/index.html'));
assert(page, 'Start the test app first');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0; const pending = new Map();
socket.onmessage = ({ data }) => { const message = JSON.parse(data); pending.get(message.id)?.(message); pending.delete(message.id); };
async function command(method, params = {}) {
  const sequence = ++id;
  const response = new Promise(resolve => pending.set(sequence, resolve));
  socket.send(JSON.stringify({ id: sequence, method, params }));
  const message = await response; assert(!message.error, JSON.stringify(message.error)); return message.result;
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression: `(async()=>(${expression}))()`, awaitPromise: true, returnByValue: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
}
async function until(expression) {
  for (let n = 0; n < 100; n++) { const value = await evaluate(expression); if (value) return value; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Timed out: ' + expression);
}
async function handoff(data) {
  const requestId = randomUUID();
  // Simulate the OS launching a second instance after browser approval.
  await promisify(execFile)(require('electron'), ['.', '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userData, 'turbodm://download?request=' + requestId], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' }, timeout: 15000 });
  for (let n = 0; n < 50; n++) {
    const response = await fetch('http://127.0.0.1:10101/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, ...data }) });
    if (response.ok) return;
    assert.equal(response.status, 409); await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Protocol handoff was not approved');
}
const payload = Buffer.from('generated report awaiting user confirmation');
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Length': payload.length, 'Content-Type': 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : payload); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const initial = await evaluate('window.tdm.getAllDownloads()');
const created = [];
try {
  const url = `http://127.0.0.1:${server.address().port}/dialog-${Date.now()}.bin`;
  await handoff({ url });
  await until(`document.getElementById('modal-add').style.display !== 'none' && document.getElementById('input-url').value === ${JSON.stringify(url)}`);
  assert.deepEqual(await evaluate('(await window.tdm.getAllDownloads()).map(d=>d.id)'), initial.map(d => d.id));
  await evaluate('hideAddModal()');
  assert.deepEqual(await evaluate('(await window.tdm.getAllDownloads()).map(d=>d.id)'), initial.map(d => d.id));
  await handoff({ url });
  await until(`document.getElementById('modal-add').style.display !== 'none' && document.getElementById('input-url').value === ${JSON.stringify(url)}`);
  await evaluate('startDownload()');
  const item = await until(`(await window.tdm.getAllDownloads()).find(d=>d.url===${JSON.stringify(url)} && d.status==='completed')`); created.push(item);
  assert.deepEqual(await fs.readFile(item.savePath), payload);
  console.log('PASS: approved protocol opens Start Download dialog; HTTP file starts only after confirmation');
  const fileName = `generated-dialog-${Date.now()}.txt`;
  await handoff({ base64: payload.toString('base64'), fileName, mimeType: 'text/plain' });
  await until(`document.getElementById('modal-add').style.display !== 'none' && document.getElementById('input-filename').value === ${JSON.stringify(fileName)}`);
  assert.equal((await evaluate('window.tdm.getAllDownloads()')).length, initial.length + 1);
  assert.equal(await evaluate("document.getElementById('input-url').readOnly"), true);
  await evaluate('startDownload()');
  const imported = await until(`(await window.tdm.getAllDownloads()).find(d=>d.fileName===${JSON.stringify(fileName)} && d.status==='completed')`); created.push(imported);
  assert.deepEqual(await fs.readFile(imported.savePath), payload);
  console.log('PASS: generated browser file opens the dialog and writes exact bytes only after confirmation');
} finally {
  await evaluate('hideAddModal()');
  for (const item of created) { await evaluate(`window.tdm.cancelDownload(${JSON.stringify(item.id)})`); await fs.rm(item.savePath, { force: true }); }
  await new Promise(r => server.close(r)); socket.close();
}
