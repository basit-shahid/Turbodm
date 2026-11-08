const API = 'http://127.0.0.1:10101';
const pending = new Map();
const captured = new Map();
const isHttp = url => /^https?:\/\//i.test(url || '');
// Restore the browser UI hidden by older TurboDM releases so fallback stays usable.
if (chrome.downloads.setUiOptions) chrome.downloads.setUiOptions({ enabled: true }).catch(() => {});
let enabled = true;
chrome.storage.local.get({ enabled: true }).then(v => { enabled = v.enabled; });
chrome.storage.onChanged.addListener(changes => { if (changes.enabled) enabled = changes.enabled.newValue; });

// Keep session headers in memory only. Never persist browser credentials.
chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  if (details.tabId < 0) return;
  const headers = {};
  for (const header of details.requestHeaders || []) {
    if (/^(cookie|authorization|referer|origin|user-agent)$/i.test(header.name)) headers[header.name] = header.value;
  }
  captured.set(details.url, { headers, method: details.method, tabId: details.tabId, time: Date.now() });
  if (captured.size > 300) captured.delete(captured.keys().next().value);
}, { urls: ['http://*/*', 'https://*/*'] }, ['requestHeaders', 'extraHeaders']);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: 'turbodm-download-link', title: 'Download with TurboDM', contexts: ['link', 'video', 'audio'],
  }));
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'turbodm-download-link') return;
  const url = info.linkUrl || info.srcUrl;
  const result = await route({ url }, tab);
  if (!result.ok && tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'turbodm-status', text: result.error }).catch(() => {});
});

async function request(path, payload) {
  const response = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'TurboDM did not accept this download');
  return result;
}

async function route(message, tab) {
  if (!isHttp(message.url) && typeof message.base64 !== 'string') return { ok: false, error: 'This link belongs to the browser. Save it in the browser instead.' };
  const key = message.requestId || message.url;
  if (pending.has(key)) return pending.get(key);
  const operation = (async () => {
    try {
      if (typeof message.base64 === 'string') {
        await request('/import', { url: message.url, fileName: message.fileName, base64: message.base64, mimeType: message.mimeType });
      } else {
        const observed = captured.get(message.url);
        const headers = observed && Date.now() - observed.time < 60000 ? { ...observed.headers } : {};
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'user-agent')) headers['User-Agent'] = navigator.userAgent;
        if (tab?.url && !Object.keys(headers).some(k => k.toLowerCase() === 'referer')) headers.Referer = tab.url;
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'cookie')) {
          const cookies = await chrome.cookies.getAll({ url: message.url });
          if (cookies.length) headers.Cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        }
        await request('/download', { url: message.url, fileName: message.fileName, headers });
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: 'TurboDM could not accept the file. The browser can still save it. ' + error.message };
    }
  })();
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'turbodm-status') {
    fetch(API + '/status', { signal: AbortSignal.timeout(2000) }).then(r => r.json()).then(reply).catch(() => reply({ online: false }));
    return true;
  }
  if (message?.type !== 'turbodm-route-download') return;
  if (!enabled) { reply({ ok: false, disabled: true }); return; }
  // Only extension pages/content scripts can submit browser data; pages cannot message this worker directly.
  route(message, sender.tab).then(reply);
  return true;
});

chrome.downloads.onCreated.addListener(async item => {
  const url = item.finalUrl || item.url;
  if (!enabled || item.byExtensionId || !isHttp(url)) return;
  const original = captured.get(url);
  if (original?.method && original.method !== 'GET') return;
  // Pause first, retain the browser item, and cancel only after the app acknowledges acceptance.
  // Blob/data/POST-only downloads remain in Chrome, which owns their request context.
  let paused = false;
  try {
    await chrome.downloads.pause(item.id);
    paused = true;
    const observed = captured.get(url);
    let tab = null;
    if (observed) tab = await chrome.tabs.get(observed.tabId).catch(() => null);
    if (!tab && item.referrer) tab = { url: item.referrer };
    const result = await route({ url, fileName: item.filename?.split(/[\\/]/).pop() }, tab);
    if (result.ok) await chrome.downloads.cancel(item.id);
    else await chrome.downloads.resume(item.id);
  } catch {
    if (paused) await chrome.downloads.resume(item.id).catch(() => {});
  }
});
