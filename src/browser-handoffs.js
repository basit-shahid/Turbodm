const { randomUUID } = require('node:crypto');
const VALID_ID = /^[a-f0-9-]{36}$/i;
const TTL = 5 * 60 * 1000;

// Approval arrives exclusively through the OS protocol handler. Session data
// arrives separately from the extension and never appears in process arguments.
class BrowserHandoffs {
  constructor() { this.requests = new Map(); this.imports = new Map(); }
  prune() {
    const now = Date.now();
    for (const [id, entry] of this.requests) if (now - entry.time > TTL) { this.requests.delete(id); this.imports.delete(id); }
  }
  approve(id) {
    this.prune();
    if (!VALID_ID.test(id || '')) return false;
    if (!this.requests.has(id)) this.requests.set(id, { time: Date.now(), delivered: false });
    return true;
  }
  submit(data) {
    this.prune();
    const entry = this.requests.get(data.requestId);
    if (!entry) return { pending: true };
    if (entry.delivered) return { duplicate: true };
    let payload;
    if (typeof data.base64 === 'string') {
      const text = data.base64;
      if (text.length % 4 || /[^A-Za-z0-9+/=]/.test(text) || /=/.test(text.slice(0, -2)) || /=[^=]$/.test(text)) throw new Error('Invalid file data');
      const buffer = Buffer.from(text, 'base64');
      if (buffer.length > 32 * 1024 * 1024) throw new Error('Browser import limit is 32 MiB');
      const fileName = String(data.fileName || 'download');
      this.imports.set(data.requestId, { buffer, fileName, mimeType: data.mimeType || 'application/octet-stream', url: 'browser-import:' + randomUUID() });
      payload = { url: '', browserFile: { id: data.requestId, fileName, fileSize: buffer.length, mimeType: data.mimeType || 'application/octet-stream' }, showDialog: true };
    } else {
      if (typeof data.url !== 'string' || !['http:', 'https:'].includes(new URL(data.url).protocol)) throw new Error('Expected an HTTP download URL');
      const headers = {};
      for (const [key, value] of Object.entries(data.headers || {})) {
        if (/^(cookie|authorization|referer|origin|user-agent)$/i.test(key) && typeof value === 'string' && !/[\r\n]/.test(value)) headers[key] = value;
      }
      payload = { url: data.url, headers, fileName: data.fileName, showDialog: true };
    }
    entry.delivered = true;
    return { payload };
  }
  getImport(id) { this.prune(); return this.imports.get(id); }
  discard(id) { this.imports.delete(id); }
}
module.exports = { BrowserHandoffs };
