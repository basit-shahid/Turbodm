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
async function openHandoffPage(message, tab, downloadId) {
  const requestId = crypto.randomUUID();
  await chrome.storage.session.set({ [requestId]: { ...message, tabId: tab?.id, tabUrl: tab?.url, downloadId, createdAt: Date.now() } });
  await chrome.tabs.create({ url: chrome.runtime.getURL('launch.html') + '?request=' + requestId });
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'turbodm-download-link') openHandoffPage({ url: info.linkUrl || info.srcUrl }, tab);
});

async function route(message, tab) {
  if (!message.requestId || (!isHttp(message.url) && typeof message.base64 !== 'string')) return { ok: false, error: 'Choose a downloadable HTTP link or browser file.' };
  if (pending.has(message.requestId)) return pending.get(message.requestId);
  const operation = (async () => {
    const observed = captured.get(message.url);
    const headers = observed && Date.now() - observed.time < 60000 ? { ...observed.headers } : {};
    headers['User-Agent'] ||= navigator.userAgent;
    if (tab?.url && !Object.keys(headers).some(k => k.toLowerCase() === 'referer')) headers.Referer = tab.url;
    if (isHttp(message.url) && !Object.keys(headers).some(k => k.toLowerCase() === 'cookie')) {
      const cookies = await chrome.cookies.getAll({ url: message.url });
      if (cookies.length) headers.Cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }
    const payload = { requestId: message.requestId, url: message.url, fileName: message.fileName, headers, base64: message.base64, mimeType: message.mimeType };
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(API + '/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(2500) });
        if (response.ok) { const result = await response.json(); if (result.success) return { ok: true }; }
        else if (response.status !== 409) {
          const result = await response.json();
          return { ok: false, error: result.error || 'Update both TurboDM and its extension.' };
        }
      } catch { /* The app may still be starting after protocol approval. */ }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    return { ok: false, error: 'TurboDM did not open. Allow the browser’s Open TurboDM prompt, then try again. No TurboDM transfer was started.' };
  })();
  pending.set(message.requestId, operation);
  try { return await operation; } finally { pending.delete(message.requestId); }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'turbodm-status') {
    fetch(API + '/status', { signal: AbortSignal.timeout(2000) }).then(r => r.json()).then(reply).catch(() => reply({ online: false }));
    return true;
  }
  if (message?.type === 'turbodm-pending') {
    chrome.storage.session.get(message.requestId).then(result => reply(result[message.requestId] || null)); return true;
  }
  if (message?.type === 'turbodm-native-save') {
    (async () => {
      if (message.downloadId != null) await chrome.downloads.resume(message.downloadId);
      else await chrome.downloads.download({ url: message.url, filename: message.fileName || undefined });
      reply({ ok: true });
    })().catch(error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== 'turbodm-route-download') return;
  if (!enabled) { reply({ ok: false, disabled: true }); return; }
  route(message, sender.tab || { id: message.tabId, url: message.tabUrl }).then(async result => {
    if (result.ok && message.downloadId != null) await chrome.downloads.cancel(message.downloadId).catch(() => {});
    if (result.ok) await chrome.storage.session.remove(message.requestId);
    reply(result);
  }).catch(error => reply({ ok: false, error: error.message }));
  return true;
});

chrome.downloads.onCreated.addListener(async item => {
  const url = item.finalUrl || item.url;
  if (!enabled || item.byExtensionId || !isHttp(url)) return;
  try {
    // No automatic resume or local-API auto-start. Script-generated downloads
    // require a fresh user click on the extension handoff page.
    await chrome.downloads.pause(item.id);
    const observed = captured.get(url);
    const tab = observed ? await chrome.tabs.get(observed.tabId).catch(() => null) : { url: item.referrer };
    await openHandoffPage({ url, fileName: item.filename?.split(/[\\/]/).pop(), browserOnly: observed?.method && observed.method !== 'GET' }, tab, item.id);
  } catch { /* A transfer already completed by Chrome cannot be rewound. */ }
});
