function showStatus(text) {
  let toast = document.getElementById('turbodm-status');
  if (!toast) { toast = document.createElement('div'); toast.id = 'turbodm-status'; toast.setAttribute('role', 'status'); document.documentElement.appendChild(toast); }
  toast.textContent = text;
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => toast.remove(), 7000);
}

async function sendToTurboDM(url, fileName) {
  try {
    const message = { type: 'turbodm-route-download', url, fileName };
    if (/^(blob:|data:)/i.test(url)) {
      const response = await fetch(url);
      const blob = await response.blob();
      if (blob.size > 32 * 1024 * 1024) throw new Error('Files over 32 MiB must be saved by the browser.');
      message.mimeType = blob.type;
      message.base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob);
      });
    }
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.disabled ? 'Browser capture is paused.' : result?.error || 'Open TurboDM and try again.');
    showStatus('Added to TurboDM');
    return true;
  } catch (error) { showStatus(error.message); return false; }
}

// HTTP links keep their original click/request semantics, including chatbot POST
// handlers and session-only endpoints. downloads.onCreated handles real downloads.
// Explicit blob/data download anchors are imported while their page still owns them.
let replaying = false;
document.addEventListener('click', async event => {
  if (replaying || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const anchor = event.target?.closest?.('a[href]');
  if (!anchor?.hasAttribute('download') || !/^(blob:|data:)/i.test(anchor.href)) return;
  event.preventDefault();
  const ok = await sendToTurboDM(anchor.href, anchor.download || 'download');
  if (!ok) { replaying = true; try { anchor.click(); } finally { replaying = false; } }
}, true);
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'turbodm-status') showStatus(message.text);
});

// ── Video Overlay Scanner ───────────────────────────────────

let scanScheduled = false;
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      scheduleScan();
      break;
    }
  }
});

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    scanForVideos();
  });
}

function scanForVideos() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (video.dataset.turbodmInjected) return;
    if (video.clientWidth < 300) return;
    video.dataset.turbodmInjected = "true";
    createOverlayButton(video);
  });
}

function createOverlayButton(videoElement) {
  let container = videoElement.parentElement;
  if (!container) return;

  const btn = document.createElement('button');
  btn.className = 'turbodm-video-overlay-btn';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none"><path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    Download
  `;

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const host = window.location.hostname.toLowerCase();
    const preferPageUrl = ['youtube', 'twitter', 'x.com', 'tiktok', 'vimeo', 'twitch'].some(domain => host.includes(domain));
    const urlToSend = preferPageUrl
      ? window.location.href
      : (videoElement.currentSrc || videoElement.src || window.location.href);

    sendToTurboDM(urlToSend);
  };

  let hideTimer = null;
  let isHoveringContainer = false;
  let isHoveringButton = false;

  const setVisible = (isVisible) => {
    btn.style.opacity = isVisible ? '1' : '0';
    btn.style.pointerEvents = isVisible ? 'auto' : 'none';
  };

  const showButton = () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    setVisible(true);
  };

  const hideButton = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!isHoveringContainer && !isHoveringButton) setVisible(false);
      hideTimer = null;
    }, 800);
  };

  container.addEventListener('pointerenter', () => { isHoveringContainer = true; showButton(); });
  container.addEventListener('pointerleave', () => { isHoveringContainer = false; hideButton(); });
  btn.addEventListener('pointerenter', () => { isHoveringButton = true; showButton(); });
  btn.addEventListener('pointerleave', () => { isHoveringButton = false; hideButton(); });

  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  setVisible(false);
  container.appendChild(btn);
}

// Initial scan and observer
scanForVideos();
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('pagehide', () => {
  observer.disconnect();
});
