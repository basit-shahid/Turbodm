const $ = id => document.getElementById(id);
(async () => {
  const saved = await chrome.storage.local.get({ enabled: true, theme: null });
  $('enabled').checked = saved.enabled;
  const status = await chrome.runtime.sendMessage({ type: 'turbodm-status' });
  document.documentElement.dataset.theme = saved.theme || status.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  $('status').textContent = status.online ? `Desktop connected — v${status.version}` : 'Desktop offline — open TurboDM';
})();
$('enabled').onchange = () => chrome.storage.local.set({ enabled: $('enabled').checked });
$('theme').onclick = () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; chrome.storage.local.set({ theme }); };
$('send').onsubmit = async event => {
  event.preventDefault();
  if (!$('enabled').checked) { $('feedback').textContent = 'Enable capture to send downloads.'; return; }
  const requestId = crypto.randomUUID();
  window.location.assign('turbodm://download?request=' + requestId);
  const button = event.submitter; button.disabled = true;
  $('feedback').textContent = 'Sending…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'turbodm-route-download', requestId, url: $('url').value });
    $('feedback').textContent = result.ok ? 'Review the Start Download dialog in TurboDM' : result.disabled ? 'Enable capture to send downloads.' : result.error;
  } catch { $('feedback').textContent = 'Reload the extension and try again.'; }
  finally { button.disabled = false; }
};
