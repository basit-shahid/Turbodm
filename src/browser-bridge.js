const http = require('node:http');
const MAX_BODY = 45 * 1024 * 1024;
function createBrowserBridge(manager, notify = () => {}, handoffs) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) { res.writeHead(403); res.end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') return reply(200, {});
    if (req.method === 'GET' && req.url === '/status') return reply(200, { online: true, version: require('../package.json').version, theme: manager.getSettings().theme || 'light', handoffVersion: 2 });
    // Older extensions must never silently auto-start a transfer.
    if (req.method === 'POST' && ['/download', '/import'].includes(req.url)) return reply(426, { error: 'Update the TurboDM extension to use the Start Download dialog' });
    if (req.method !== 'POST' || req.url !== '/handoff') return reply(404, { error: 'Unknown endpoint' });
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Expected JSON' });
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) return reply(413, { error: 'File exceeds browser import limit' }); chunks.push(chunk); }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      const result = handoffs.submit(data);
      if (result.pending) return reply(409, { pending: true });
      if (result.payload) notify(result.payload);
      reply(200, { success: true });
    } catch (error) { if (!res.headersSent) reply(400, { error: error.message }); }
  });
}
module.exports = { createBrowserBridge };
