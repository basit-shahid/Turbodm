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
  const { BrowserHandoffs } = require('../src/browser-handoffs');
  const { randomUUID } = require('node:crypto');
  const handoffs = new BrowserHandoffs();
  const shown = []; let starts = 0;
  const bridge = createBrowserBridge({ getSettings: () => ({ theme: 'dark' }), addDownload: () => { starts++; }, importBrowserFile: () => { starts++; } }, data => shown.push(data), handoffs);
  await listen(bridge);
  const base = `http://127.0.0.1:${bridge.address().port}`;
  const post = (path, data, origin) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) });
  try {
    const requestId = randomUUID();
    assert.equal((await post('/handoff', { requestId, url })).status, 409);
    assert.equal(shown.length, 0);
    handoffs.approve(requestId);
    assert.equal((await post('/handoff', { requestId, url, headers: { Cookie: 'session=valid' } })).status, 200);
    assert.equal(shown.length, 1); assert.equal(shown[0].showDialog, true); assert.equal(shown[0].headers.Cookie, 'session=valid');
    assert.equal((await post('/handoff', { requestId, url })).status, 200); assert.equal(shown.length, 1);
    const invalidId = randomUUID(); handoffs.approve(invalidId);
    assert.equal((await post('/handoff', { requestId: invalidId, url: 'file:///private' })).status, 400);
    assert.equal((await post('/handoff', { requestId, url }, 'https://untrusted.example')).status, 403);
    assert.equal((await post('/download', { url })).status, 426);
    assert.equal((await post('/import', { base64: payload.toString('base64') })).status, 426);
    const importId = randomUUID(); handoffs.approve(importId);
    assert.equal((await post('/handoff', { requestId: importId, base64: payload.toString('base64'), fileName: 'report.txt' })).status, 200);
    assert.deepEqual(handoffs.getImport(importId).buffer, payload);
    assert.equal(shown[1].browserFile.id, importId);
    assert.equal(starts, 0, 'Handoffs must never start transfers or write files');
    handoffs.discard(importId); assert.equal(handoffs.getImport(importId), undefined);
    console.log('PASS: protocol approval required; HTTP/blob handoffs open a dialog without starting; duplicates and old auto-start endpoints blocked');
  } finally { await close(bridge); }
  const listeners = {}, actions = [], session = {}; let requests = 0;
  const event = name => ({ addListener: listener => { listeners[name] = listener; } });
  const chrome = {
    storage: { local: { get: async () => ({ enabled: true }) }, session: { set: async data => Object.assign(session, data), get: async id => ({[id]:session[id]}), remove: async id => delete session[id] }, onChanged: event('storage') },
    webRequest: { onBeforeSendHeaders: event('headers') }, runtime: { getURL: path => 'chrome-extension://test/' + path, onInstalled: event('installed'), onMessage: event('message') },
    contextMenus: { onClicked: event('context') }, cookies: { getAll: async () => [] }, tabs: { get: async () => null, create: async () => actions.push('handoff-page') },
    downloads: { onCreated: event('download'), pause: async () => actions.push('pause'), resume: async () => actions.push('resume'), cancel: async () => actions.push('cancel'), download: async () => actions.push('native-download') }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../browser-extension/background.js'), 'utf8'), { chrome, crypto: {randomUUID}, navigator: { userAgent: 'test' }, fetch: async () => { requests++; return { ok: true, json: async () => ({ success: true }) }; }, AbortSignal, URL, Map, Date, setTimeout });
  await listeners.download({ id: 1, url: 'https://example.test/file' });
  assert.deepEqual(actions, ['pause', 'handoff-page']); assert.equal(requests, 0, 'Native capture cannot silently hand off or resume'); actions.length = 0;
  const reply = message => new Promise(resolve => listeners.message(message, {}, resolve));
  assert.equal((await reply({ type: 'turbodm-route-download', requestId: randomUUID(), url: 'https://example.test/file', downloadId: 1 })).ok, true);
  assert.deepEqual(actions, ['cancel']); actions.length = 0;
  await reply({ type: 'turbodm-native-save', downloadId: 2 }); assert.deepEqual(actions, ['resume']);
  console.log('PASS: script downloads pause for explicit Open TurboDM; cancel after dialog handoff; browser resumes only on explicit request');
  const clickActions = [], contentListeners = {};
  const contentChrome = { storage: { local: { get: async () => ({ enabled: true }) }, onChanged: { addListener: fn => contentListeners.storage = fn } }, runtime: { sendMessage: async message => { clickActions.push('message'); assert(message.requestId); return { ok: true }; }, onMessage: { addListener() {} } } };
  const element = () => ({ setAttribute() {}, remove() {}, style: {}, appendChild() {} });
  const document = { addEventListener: (name, fn) => contentListeners[name] = fn, querySelectorAll: () => [], getElementById: () => null, createElement: element, documentElement: element(), body: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../browser-extension/content.js'), 'utf8'), { chrome: contentChrome, crypto: { randomUUID }, document, window: { location: { assign: target => { assert.match(target, /^turbodm:\/\/download\?request=[a-f0-9-]+$/); clickActions.push('protocol'); } }, addEventListener() {} }, URL, MutationObserver: class { observe() {} disconnect() {} }, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {} });
  const anchor = { href: 'https://example.test/report.zip', hasAttribute: () => false };
  const eventClick = { isTrusted: true, button: 0, target: { closest: () => anchor }, preventDefault: () => clickActions.push('prevent'), stopImmediatePropagation: () => clickActions.push('stop') };
  contentListeners.click(eventClick);
  assert.deepEqual(clickActions, ['prevent', 'stop', 'protocol', 'message']);
  clickActions.length = 0; contentListeners.storage({ enabled: { newValue: false } }); contentListeners.click(eventClick); assert.deepEqual(clickActions, []);
  console.log('PASS: file click blocks native navigation and launches OS protocol synchronously before asynchronous handoff; disabled capture leaves clicks alone');

})().catch(error => { console.error(error); process.exitCode = 1; });
