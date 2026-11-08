const http = require('node:http');
const MAX_BODY = 45 * 1024 * 1024;

function createBrowserBridge(manager, notify = () => {}) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) { res.writeHead(403); res.end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') return reply(200, {});
    if (req.method === 'GET' && req.url === '/status') return reply(200, { online: true, version: require('../package.json').version, theme: manager.getSettings().theme || 'light' });
    if (req.method !== 'POST' || !['/download', '/import'].includes(req.url)) return reply(404, { error: 'Unknown endpoint' });
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Expected JSON' });
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) return reply(413, { error: 'File exceeds browser import limit' }); chunks.push(chunk); }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      let result;
      if (req.url === '/import') {
        if (typeof data.base64 !== 'string' || data.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data.base64) || /=/.test(data.base64.slice(0, -2)) || /=[^=]$/.test(data.base64)) throw new Error('Invalid file data');
        const buffer = Buffer.from(data.base64, 'base64');
        if (buffer.length > 32 * 1024 * 1024) return reply(413, { error: 'File exceeds 32 MiB browser import limit' });
        result = await manager.importBrowserFile(buffer, data);
      } else {
        if (typeof data.url !== 'string' || !['http:', 'https:'].includes(new URL(data.url).protocol)) throw new Error('Expected an HTTP download URL');
        const headers = {};
        for (const [key, value] of Object.entries(data.headers || {})) {
          if (/^(cookie|authorization|referer|origin|user-agent)$/i.test(key) && typeof value === 'string' && !/[\r\n]/.test(value)) headers[key] = value;
        }
        result = await manager.addDownload(data.url, { headers, fileName: data.fileName });
        if (!result || result.error) throw new Error(result?.error || 'Download was not accepted');
      }
      notify(result);
      reply(200, { success: true, id: result.id });
    } catch (error) { if (!res.headersSent) reply(400, { success: false, error: error.message }); }
  });
}
module.exports = { createBrowserBridge };
