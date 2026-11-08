const id = new URL(location.href).searchParams.get('request');
let pending;
const open = document.getElementById('open'), feedback = document.getElementById('feedback');
chrome.runtime.sendMessage({ type: 'turbodm-pending', requestId: id }).then(value => {
  pending = value;
  if (!value || Date.now() - value.createdAt > 5 * 60 * 1000) { open.disabled = true; feedback.textContent = 'This link expired. Capture it again from the source page.'; return; }
  document.getElementById('file').textContent = value.fileName || value.url;
  if (value.browserOnly) { open.disabled = true; feedback.textContent = 'This download uses a browser-only request. Choose Save in browser instead.'; }
});
open.onclick = async () => {
  if (!pending) return;
  const requestId = crypto.randomUUID();
  window.location.assign('turbodm://download?request=' + requestId);
  open.disabled = true;
  let delivered = false;
  feedback.textContent = 'Waiting for permission and TurboDM to open';
  try {
    const result = await chrome.runtime.sendMessage({ ...pending, type: 'turbodm-route-download', requestId });
    feedback.textContent = result.ok ? 'The Start Download dialog is ready in TurboDM.' : result.error;
    delivered = result.ok;
    if (result.ok) { document.getElementById('browser').disabled = true; await chrome.storage.session.remove(id); }
  } catch (error) { feedback.textContent = error.message; }
  finally { open.disabled = delivered; }
};
document.getElementById('browser').onclick = async () => {
  if (!pending) return;
  const result = await chrome.runtime.sendMessage({ type: 'turbodm-native-save', ...pending });
  feedback.textContent = result.ok ? 'Continued in the browser at your request.' : result.error;
  if (result.ok) { open.disabled = true; document.getElementById('browser').disabled = true; await chrome.storage.session.remove(id); }
};
