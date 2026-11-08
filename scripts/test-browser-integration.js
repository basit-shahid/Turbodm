const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const Engine = require('../src/download-engine');
const { createBrowserBridge } = require('../src/browser-bridge');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));
(async () => {
  const payload = Buffer.from('chatbot generated file');
  const target = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/file' }); return res.end(); }
    assert.equal(req.headers.cookie, 'session=valid');
    assert.equal(req.headers['accept-encoding'], 'identity');
    if (req.method === 'HEAD') { res.writeHead(405); return res.end(); }
    res.writeHead(206, { 'Content-Range': `bytes 0-0/${payload.length}`, 'Content-Length': 1, 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="report.txt"' }); res.end(payload.subarray(0, 1));
  });
  await listen(target);
  const url = `http://127.0.0.1:${target.address().port}/redirect`;
  const engine = new Engine(url, '', { headers: { cookie: 'session=valid', authorization: 'Bearer private' } });
  try {
    const info = await engine.getFileInfo();
    assert.equal(info.fileSize, payload.length); assert.equal(info.fileName, 'report.txt');
    const foreign = engine._getDefaultHeaders(false, 'http://localhost:9999/file');
    assert.equal(foreign.Cookie, undefined); assert.equal(foreign.Authorization, undefined);
    assert.equal(engine.getSerializableState().headers.Cookie, undefined);
    assert.equal(engine.getSerializableState().headers.Authorization, undefined);
    console.log('PASS: authenticated redirect, HEAD fallback, range total, credential scoping');
  } finally { engine._destroyAgents(); await close(target); }
  let reject = true; let imported;
  const bridge = createBrowserBridge({ getSettings: () => ({ theme: 'dark' }), addDownload: async () => reject ? { error: 'Expired link' } : { id: 'accepted' }, importBrowserFile: async (buffer, data) => { imported = buffer; return { id: 'imported' }; } });
  await listen(bridge);
  const base = `http://127.0.0.1:${bridge.address().port}`;
  const post = (path, data, origin) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) });
  try {
    assert.equal((await post('/download', { url })).status, 400);
    reject = false;
    assert.equal((await (await post('/download', { url })).json()).success, true);
    assert.equal((await post('/download', { url: 'file:///private' })).status, 400);
    assert.equal((await post('/download', { url }, 'https://untrusted.example')).status, 403);
    assert.equal((await post('/import', { base64: payload.toString('base64'), fileName: 'report.txt' })).status, 200);
    assert.deepEqual(imported, payload);
    assert.equal((await post('/import', { base64: 'not base64!' })).status, 400);
    assert.equal((await post('/import', { base64: '' })).status, 200);
    const large = Buffer.alloc(2 * 1024 * 1024, 42);
    assert.equal((await post('/import', { base64: large.toString('base64') })).status, 200);
    assert.deepEqual(imported, large);
    console.log('PASS: bridge acknowledgement, failed handoff, browser import bytes and validation');
  } finally { await close(bridge); }
  const listeners = {}; const actions = []; let accept = false;
  const event = name => ({ addListener: listener => { listeners[name] = listener; } });
  const chrome = { storage: { local: { get: async () => ({ enabled: true }) }, onChanged: event('storage') }, webRequest: { onBeforeSendHeaders: event('headers') }, runtime: { onInstalled: event('installed'), onMessage: event('message') }, contextMenus: { onClicked: event('context') }, cookies: { getAll: async () => [] }, tabs: { get: async () => null }, downloads: { onCreated: event('download'), pause: async () => actions.push('pause'), resume: async () => actions.push('resume'), cancel: async () => actions.push('cancel') } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../browser-extension/background.js'), 'utf8'), { chrome, navigator: { userAgent: 'test' }, fetch: async () => ({ ok: accept, json: async () => ({ success: accept }) }), AbortSignal, URL, Map, Date });
  await listeners.download({ id: 1, url: 'https://example.test/file' });
  assert.deepEqual(actions, ['pause', 'resume']); actions.length = 0; accept = true;
  await listeners.download({ id: 2, url: 'https://example.test/file' });
  assert.deepEqual(actions, ['pause', 'cancel']); actions.length = 0;
  await listeners.download({ id: 3, url: 'blob:https://example.test/file' });
  assert.deepEqual(actions, []);
  listeners.headers({ url: 'https://example.test/post', method: 'POST', tabId: 1 });
  await listeners.download({ id: 4, url: 'https://example.test/post' }); assert.deepEqual(actions, []);
  console.log('PASS: extension resumes on rejection, cancels after acknowledgement, preserves blob and POST downloads');
})().catch(error => { console.error(error); process.exitCode = 1; });
