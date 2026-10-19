// ===== STATE =====
let downloads = [];
let clipboardUrl = null;
let clipboardHeaders = {};
let addModalHeaders = {};
let toastTimeout = null;
let currentFilter = "all";
let searchQuery = "";
let lastAnalyzedInfo = null;
let nextAddedOrder = 1;
let analysisRequest = 0;

function getAddedRank(download) {
  return (
    Number(download.createdAt) ||
    Number(download.addedAt) ||
    Number(download.startTime) ||
    Number(download.__addedOrder) ||
    0
  );
}

// ===== DOM REFS =====
const $downloadList = document.getElementById("download-list");
const $emptyState = document.getElementById("empty-state");
const $modalAdd = document.getElementById("modal-add");
const $modalSettings = document.getElementById("modal-settings");
const $inputUrl = document.getElementById("input-url");
const $inputFilename = document.getElementById("input-filename");
const $inputConnections = document.getElementById("input-connections");
const $fileInfo = document.getElementById("file-info");
const $clipboardToast = document.getElementById("clipboard-toast");
const $toastUrl = document.getElementById("toast-url");

// Status bar
const $statusActive = document.getElementById("status-active");
const $statusTotal = document.getElementById("status-total");
const $statusSpeed = document.getElementById("status-speed");

// ===== FILE TYPE HELPERS =====
const fileTypeMap = {
  video: ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"],
  audio: ["mp3", "flac", "aac", "ogg", "wav", "wma"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"],
  image: ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "tiff", "psd"],
  document: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"],
  executable: ["exe", "msi", "dmg", "pkg", "deb", "rpm", "apk"],
};

function getFileType(fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  for (const [type, exts] of Object.entries(fileTypeMap)) {
    if (exts.includes(ext)) return type;
  }
  return "other";
}

function getFileExt(fileName) {
  return fileName.split(".").pop().toUpperCase().substring(0, 4);
}

// ===== FORMAT HELPERS =====
function formatBytes(bytes) {
  return window.tdm.formatBytes(bytes);
}
function formatTime(seconds) {
  return window.tdm.formatTime(seconds);
}
function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 B/s";
  return formatBytes(bytesPerSec) + "/s";
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const glyphs = {
  file: '<path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8m-8 4h6"/>',
  video:
    '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
  audio:
    '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
  archive: '<path d="M4 7h16v14H4zM3 3h18v4H3zM10 11h4"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  cancel: '<path d="m6 6 12 12M18 6 6 18"/>',
  retry: '<path d="M3 4v6h6M3 10a9 9 0 1 1 1 8"/>',
  folder: '<path d="M3 7V4h6l3 3h9v13H3Z"/>',
  open: '<path d="M14 3h7v7m0-7L10 14M9 5H3v16h16v-6"/>',
};
function glyph(name) {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || glyphs.file}</svg>`;
}
function actionButton(action, label, icon, extra = "") {
  return `<button class="btn ${action === "cancel" ? "btn-danger-ghost" : "btn-ghost"}" data-action="${action}" title="${label}" aria-label="${label}" ${extra}>${glyph(icon)}</button>`;
}
function renderTransportNotice(dl) {
  return dl.transportNotice
    ? `<div class="transport-notice">${escapeHtml(dl.transportNotice)}</div>`
    : "";
}
function renderDownloadItem(dl) {
  const name = dl.fileName || "Untitled download";
  const type = dl.isStreaming ? "video" : getFileType(name);
  const status = [
    "downloading",
    "paused",
    "completed",
    "failed",
    "cancelled",
    "pending",
  ].includes(dl.status)
    ? dl.status
    : "pending";
  const active = status === "downloading";
  const completed = status === "completed";
  const progress = completed
    ? 100
    : Math.max(0, Math.min(Number(dl.progress) || 0, 100));
  const mode = dl.connectionMode === "parallel" ? "parallel" : "single";
  let source = "Direct download";
  try {
    source = new URL(dl.url).hostname;
  } catch {}
  let actions = "";
  if (!completed && status !== "cancelled" && !dl.isStreaming) {
    const nextMode = mode === "parallel" ? "single" : "parallel";
    actions += `<button class="btn btn-ghost mode-toggle-btn" data-action="mode" data-mode="${nextMode}" title="Switch to ${nextMode} connection mode">${mode === "parallel" ? "Parallel" : "Single"}</button>`;
  }
  if (active || status === "pending")
    actions += actionButton("pause", "Pause download", "pause");
  if (status === "paused")
    actions += actionButton("resume", "Resume download", "play");
  if (status === "failed")
    actions += actionButton("retry", "Retry download", "retry");
  if (completed)
    actions +=
      actionButton("open", "Open file", "open") +
      actionButton("folder", "Show in folder", "folder");
  actions += actionButton(
    "cancel",
    completed || status === "failed" ? "Remove from list" : "Cancel download",
    "cancel",
  );
  const size = completed
    ? formatBytes(dl.fileSize || dl.downloadedBytes || 0)
    : `${formatBytes(dl.downloadedBytes || 0)}${dl.fileSize > 0 ? " / " + formatBytes(dl.fileSize) : ""}`;
  const labels = {
    downloading: "Downloading",
    pending: "Queued",
    paused: "Paused",
    completed: "Completed",
    failed: "Needs attention",
    cancelled: "Cancelled",
  };
  return `<article class="download-item ${status}" data-id="${escapeHtml(dl.id)}" aria-label="${escapeHtml(name)} — ${labels[status]}">
    <div class="download-header"><div class="download-info"><div class="file-icon ${type}">${glyph(type)}<span>${escapeHtml(getFileExt(name))}</span></div><div class="file-details"><div class="file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div><div class="file-source" title="${escapeHtml(source)}">${escapeHtml(source)}</div><div class="file-meta"><span class="status-badge ${status}"><span class="status-dot-indicator"></span>${labels[status]}</span><span class="dot">·</span><span class="text-size">${size}</span><span class="text-eta-wrapper" style="display:${active && dl.eta > 0 ? "inline" : "none"}"><span class="dot"> · </span><span class="text-eta">${formatTime(dl.eta)} left</span></span></div></div></div><div class="download-actions">${actions}</div></div>
    <div class="progress-container"><div class="progress-bar" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><div class="progress-fill ${status}" style="width:${progress}%"></div></div>
    ${!completed && dl.chunks?.length > 1 ? `<div class="chunks-bar" aria-hidden="true">${dl.chunks.map((c) => `<div class="chunk-segment"><div class="chunk-fill" style="width:${Math.max(0, Math.min(c.progress || 0, 100))}%"></div></div>`).join("")}</div>` : ""}
    ${status === "failed" ? `<div class="error-detail">${escapeHtml(dl.error || "The transfer was interrupted. Try again when you’re ready.")}</div>` : renderTransportNotice(completed ? {} : dl)}
    <div class="progress-stats"><div class="progress-left">${completed ? '<span class="complete-note">Ready to open</span>' : `<span class="speed-indicator">${active ? formatSpeed(dl.speed) : status === "paused" ? "Resume whenever you’re ready" : status === "pending" ? "Waiting for a free slot" : ""}</span><span class="connections-badge">${active ? `${dl.activeConnections || 0} / ${dl.connections || 1} connections` : ""}</span>`}</div><span class="text-perc">${dl.fileSize > 0 ? progress.toFixed(1) + "%" : "Size unknown"}</span></div></div>
  </article>`;
}

// ===== RENDER ALL =====
let sortOrder = "newest";
const viewLabels = {
  all: "All downloads",
  downloading: "In progress",
  completed: "Completed",
  paused: "Paused",
  failed: "Needs attention",
  video: "Videos",
  audio: "Audio",
  archive: "Archives",
  document: "Documents",
  image: "Images",
};
function matchesView(d, filter) {
  if (filter === "all") return true;
  if (filter === "downloading")
    return d.status === "downloading" || d.status === "pending";
  if (["completed", "paused", "failed"].includes(filter))
    return d.status === filter;
  return (d.isStreaming ? "video" : getFileType(d.fileName || "")) === filter;
}
function itemMatchesFilters(d) {
  const matchesSearch =
    !searchQuery ||
    `${d.fileName || ""} ${d.url || ""}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
  return matchesSearch && matchesView(d, currentFilter);
}
function renderDownloads() {
  const filtered = downloads.filter(itemMatchesFilters);
  document.getElementById("view-title").textContent =
    viewLabels[currentFilter] || "Downloads";
  document.getElementById("view-count").textContent = filtered.length;
  const sorted = [...filtered].sort((a, b) =>
    sortOrder === "name"
      ? (a.fileName || "").localeCompare(b.fileName || "")
      : sortOrder === "size"
        ? (b.fileSize || 0) - (a.fileSize || 0)
        : getAddedRank(b) - getAddedRank(a),
  );
  $downloadList.replaceChildren($emptyState);
  $emptyState.style.display = filtered.length ? "none" : "";
  if (!filtered.length) {
    const fresh = downloads.length === 0;
    $emptyState.querySelector("h3").textContent = fresh
      ? "Your next download starts here"
      : searchQuery
        ? "No matching downloads"
        : `No ${currentFilter === "all" ? "" : viewLabels[currentFilter].toLowerCase() + " "}downloads`;
    $emptyState.querySelector("p").textContent = fresh
      ? "Add a link and let TurboDM take care of the rest."
      : searchQuery
        ? "Try a different filename or clear your search."
        : "Downloads will appear here as your library grows.";
    document.getElementById("empty-add").textContent = fresh
      ? "+ Add your first download"
      : "+ New download";
  } else {
    $downloadList.insertAdjacentHTML(
      "beforeend",
      sorted.map(renderDownloadItem).join(""),
    );
  }
  updateStatusBar();
}

function updateDownloadInPlace(state) {
  const idx = downloads.findIndex((d) => d.id === state.id);
  if (idx >= 0) {
    state.__addedOrder = downloads[idx].__addedOrder || nextAddedOrder++;
    downloads[idx] = state;
  } else {
    state.__addedOrder = state.__addedOrder || nextAddedOrder++;
    downloads.push(state);
  }

  const isVisible = itemMatchesFilters(state);
  const existing = $downloadList.querySelector(
    `[data-id="${CSS.escape(state.id)}"]`,
  );

  if (!isVisible) {
    if (existing) {
      renderDownloads();
    }
    updateStatusBar();
    return;
  }

  // Try to update in place for performance
  if (existing) {
    const oldStatus = existing.className
      .split(" ")
      .find((c) =>
        [
          "downloading",
          "paused",
          "completed",
          "failed",
          "cancelled",
          "pending",
        ].includes(c),
      );

    // Only do targeted in-place updates if retaining the "downloading" status
    if (state.status === "downloading" && oldStatus === "downloading") {
      // Bar updates
      const progressFill = existing.querySelector(".progress-fill");
      if (progressFill) progressFill.style.width = `${state.progress || 0}%`;
      existing
        .querySelector("[role=progressbar]")
        ?.setAttribute("aria-valuenow", state.progress || 0);
      const connections = existing.querySelector(".connections-badge");
      if (connections)
        connections.textContent = `${state.activeConnections || 0} / ${state.connections || 1} connections`;
      const modeButton = existing.querySelector("[data-action=mode]");
      if (modeButton) {
        modeButton.textContent =
          state.connectionMode === "parallel" ? "Parallel" : "Single";
        modeButton.dataset.mode =
          state.connectionMode === "parallel" ? "single" : "parallel";
      }

      const chunks = existing.querySelectorAll(".chunk-fill");
      if (chunks.length > 0 && state.chunks) {
        state.chunks.forEach((c, i) => {
          if (chunks[i])
            chunks[i].style.width = `${Math.min(c.progress || 0, 100)}%`;
        });
      }

      // Text updates
      const sizeTextEl = existing.querySelector(".text-size");
      if (sizeTextEl) {
        const p = state.progress || 0;
        const total = state.fileSize > 0 ? formatBytes(state.fileSize) : "?";
        sizeTextEl.textContent =
          state.fileSize > 0
            ? `${formatBytes(state.downloadedBytes)} / ${total}`
            : formatBytes(state.downloadedBytes);
      }

      const etaWrapEl = existing.querySelector(".text-eta-wrapper");
      const etaEl = existing.querySelector(".text-eta");
      if (etaWrapEl && etaEl) {
        if (state.eta > 0) {
          etaWrapEl.style.display = "inline";
          etaEl.textContent = `${formatTime(state.eta)} left`;
        } else {
          etaWrapEl.style.display = "none";
        }
      }

      const percEl = existing.querySelector(".text-perc");
      if (percEl && state.fileSize > 0)
        percEl.textContent = (state.progress || 0).toFixed(1) + "%";

      const speedEl = existing.querySelector(".speed-indicator");
      if (speedEl) speedEl.textContent = formatSpeed(state.speed);

      const noticeEl = existing.querySelector(".transport-notice");
      if (state.transportNotice) {
        if (noticeEl) {
          noticeEl.textContent = state.transportNotice;
        } else {
          const progressContainer = existing.querySelector(
            ".progress-container",
          );
          const progressStats = existing.querySelector(".progress-stats");
          if (progressContainer && progressStats) {
            const noticeNode = document.createElement("div");
            noticeNode.className = "transport-notice";
            noticeNode.textContent = state.transportNotice;
            progressContainer.insertBefore(noticeNode, progressStats);
          }
        }
      } else if (noticeEl) {
        noticeEl.remove();
      }

      // We rely on the rest largely staying identical while actively downloading
    } else {
      // If status changed (e.g. newly completed, paused), rewrite node completely
      const temp = document.createElement("div");
      temp.innerHTML = renderDownloadItem(state);
      existing.replaceWith(temp.firstElementChild);
    }
  } else {
    // New item - re-render the whole list to respect filters/sorting
    renderDownloads();
  }
  updateStatusBar();
}

function updateStatusBar() {
  const active = downloads.filter((d) => d.status === "downloading").length;
  const totalSpeed = downloads.reduce(
    (sum, d) => (d.status === "downloading" ? sum + (d.speed || 0) : sum),
    0,
  );

  document.getElementById("metric-active").textContent = active;
  const completed = downloads.filter((d) => d.status === "completed");
  document.getElementById("metric-completed").textContent = completed.length;
  document.getElementById("metric-volume").textContent =
    `${formatBytes(completed.reduce((sum, d) => sum + (d.fileSize || d.downloadedBytes || 0), 0))} downloaded`;
  const queued = downloads.filter((d) => d.status === "pending").length;
  document.getElementById("metric-queue").textContent = queued
    ? `${queued} waiting in queue`
    : active
      ? "Transfers in motion"
      : "Ready when you are";
  document.getElementById("overview-speed").innerHTML = formatSpeed(
    totalSpeed,
  ).replace(/ (.+)$/, " <span>$1</span>");
  document.querySelectorAll("[data-count]").forEach((el) => {
    el.textContent = downloads.filter((d) =>
      matchesView(d, el.dataset.count),
    ).length;
  });
  document.getElementById("view-count").textContent =
    downloads.filter(itemMatchesFilters).length;
  document.getElementById("btn-pause-all").disabled = !active;
  document.getElementById("btn-resume-all").disabled = !downloads.some(
    (d) => d.status === "paused",
  );
  document.getElementById("btn-retry-all").hidden = !downloads.some(
    (d) => d.status === "failed",
  );
  document.getElementById("btn-clear").disabled = !completed.length;
  $statusActive.textContent = `${active} active`;
  $statusTotal.textContent = `${downloads.length} download${downloads.length !== 1 ? "s" : ""}`;
  $statusSpeed.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2L12 18M12 18L7 13M12 18L17 13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
    ${formatSpeed(totalSpeed)}`;
}

// ===== DOWNLOAD ACTIONS =====
async function pauseDownload(id) {
  const result = await window.tdm.pauseDownload(id);
  if (result?.error) throw new Error(result.error);
  if (result?.id) updateDownloadInPlace(result);
}

async function resumeDownload(id) {
  const result = await window.tdm.resumeDownload(id);
  if (result?.error) throw new Error(result.error);
  if (result?.id) updateDownloadInPlace(result);
}

async function cancelDownload(id) {
  await window.tdm.cancelDownload(id);
  downloads = downloads.filter((d) => d.id !== id);
  renderDownloads();
}

async function switchDownloadMode(id, mode) {
  const result = await window.tdm.setDownloadMode(id, mode);
  if (!result) return;

  if (result.error) {
    notify("Mode switch failed: " + result.error);
    return;
  }

  updateDownloadInPlace(result);
}

async function retryDownload(id, url) {
  const dl = downloads.find((d) => d.id === id);
  if (!dl) return;

  // Optimistically set to pending to show we are trying
  dl.status = "pending";
  dl.error = null;
  updateDownloadInPlace(dl);

  const result = await window.tdm.resumeDownload(id);
  if (result && !result.error) {
    updateDownloadInPlace(result);
  } else {
    // If it still fails, keep it in the list with the new error
    const errorMsg =
      result && result.error
        ? result.error
        : "Retry failed. Check your connection.";
    dl.status = "failed";
    dl.error = errorMsg;
    updateDownloadInPlace(dl);
  }
}

async function openFile(filePath) {
  const error = await window.tdm.openFile(filePath);
  if (error) notify(error);
}

async function openFolder(filePath) {
  await window.tdm.openFolder(filePath);
}

// ===== ADD DOWNLOAD MODAL =====
function showAddModal(url = "", headers = {}) {
  openDialog($modalAdd);
  document.getElementById("add-error").hidden = true;
  lastAnalyzedInfo = null;
  document.getElementById("group-quality").style.display = "none";
  document.getElementById("group-connections").style.display = "block";
  document.getElementById("group-transfer-mode").style.display = "block";
  addModalHeaders = headers || {};
  $inputUrl.value = url;
  $inputUrl.removeAttribute("aria-invalid");
  document.getElementById("btn-analyze").disabled = false;
  document.getElementById("btn-analyze").innerHTML = glyph("retry");
  $inputFilename.value = "";
  $fileInfo.style.display = "none";
  $inputUrl.focus();

  if (url) {
    analyzeUrl(url, undefined, addModalHeaders);
  }
}

function hideAddModal() {
  analysisRequest++;
  closeDialog($modalAdd);
  addModalHeaders = {};
  $inputUrl.value = "";
  $inputFilename.value = "";
  document.getElementById("input-transfer-mode").value = "auto";
  $fileInfo.style.display = "none";
  lastAnalyzedInfo = null;
}

async function analyzeUrl(url, formatId, headers = addModalHeaders) {
  if (!validateDownloadUrl(url)) return;

  const request = ++analysisRequest;
  const $btn = document.getElementById("btn-analyze");
  $btn.innerHTML =
    '<div class="analyzing-spinner"><span></span><span></span><span></span></div>';
  $btn.disabled = true;

  try {
    const info = await window.tdm.getFileInfo(url, formatId, headers);
    if (request !== analysisRequest) return;
    if (info.error) {
      lastAnalyzedInfo = null;
      $fileInfo.style.display = "block";
      document.getElementById("info-filename").textContent =
        "Error: " + info.error;
      document.getElementById("info-filesize").textContent = "—";
      document.getElementById("info-resumable").textContent = "—";
      document.getElementById("info-connections").textContent = "—";
    } else {
      $fileInfo.style.display = "block";
      document.getElementById("info-filename").textContent =
        info.fileName || "Unknown";
      document.getElementById("info-filesize").textContent = info.fileSize
        ? formatBytes(info.fileSize)
        : "Unknown";
      document.getElementById("info-resumable").textContent = info.supportsRange
        ? "✓ Yes"
        : "✗ No";
      lastAnalyzedInfo = info;
      updateAnalyzedConnectionInfo(info);
      $inputFilename.value = info.fileName || "";

      const $groupQuality = document.getElementById("group-quality");
      const $groupConnections = document.getElementById("group-connections");
      const $groupTransferMode = document.getElementById("group-transfer-mode");
      const $inputQuality = document.getElementById("input-quality");

      if (info.isStreaming) {
        $groupQuality.style.display = "block";
        $groupConnections.style.display = "none";
        $groupTransferMode.style.display = "none";
        $inputQuality.innerHTML = `
          <option value="bestvideo+bestaudio/best">Best Quality (Auto)</option>
          <option value="bestvideo[height<=2160]+bestaudio/best">4K (2160p)</option>
          <option value="bestvideo[height<=1440]+bestaudio/best">2K (1440p)</option>
          <option value="bestvideo[height<=1080]+bestaudio/best" selected>1080p</option>
          <option value="bestvideo[height<=720]+bestaudio/best">720p</option>
          <option value="bestvideo[height<=480]+bestaudio/best">480p</option>
          <option value="bestaudio/best">Audio Only</option>
        `;
      } else {
        $groupQuality.style.display = "none";
        $groupConnections.style.display = "block";
        $groupTransferMode.style.display = "block";
      }
    }
  } catch (err) {
    if (request !== analysisRequest) return;
    lastAnalyzedInfo = null;
    $fileInfo.style.display = "block";
    document.getElementById("info-filename").textContent =
      "Error: " + err.message;
  }

  $btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  $btn.disabled = false;
}

async function startDownload() {
  if (document.getElementById("btn-start-download").disabled) return;
  const url = $inputUrl.value.trim();
  if (!validateDownloadUrl(url)) return;

  const settings = await window.tdm.getSettings();
  const options = {
    fileName: $inputFilename.value.trim() || undefined,
    connections: parseInt($inputConnections.value, 10) || 32,
    modePreference:
      document.getElementById("input-transfer-mode").value || "auto",
    formatId:
      document.getElementById("group-quality").style.display !== "none"
        ? document.getElementById("input-quality").value
        : undefined,
    downloadDir: settings.downloadDir || undefined,
    headers: addModalHeaders,
  };

  const button = document.getElementById("btn-start-download");
  button.disabled = true;
  try {
    const result = await window.tdm.addDownload(url, options);
    if (!result || result.error)
      throw new Error(
        result?.error || "Unable to start the download. Please try again.",
      );
    hideAddModal();
    updateDownloadInPlace(result);
    notify("Download added to your workspace");
  } catch (error) {
    const el = document.getElementById("add-error");
    el.textContent = error.message;
    el.hidden = false;
  } finally {
    button.disabled = false;
  }
}

function updateAnalyzedConnectionInfo(info) {
  if (!info) return;

  const transferMode =
    document.getElementById("input-transfer-mode").value || "auto";
  const isParallelRequested =
    transferMode === "parallel" || transferMode === "auto";
  const supportsParallel = info.supportsRange && isParallelRequested;

  if (transferMode === "single") {
    document.getElementById("info-connections").textContent = "1 (series mode)";
    return;
  }

  document.getElementById("info-connections").textContent = supportsParallel
    ? $inputConnections.value || "32"
    : "1 (no range support)";
}

// ===== SETTINGS MODAL =====
async function showSettings() {
  const settings = await window.tdm.getSettings();
  document.getElementById("settings-dir").value = settings.downloadDir || "";
  document.getElementById("settings-concurrent").value =
    settings.maxConcurrent || 5;
  document.getElementById("settings-connections").value =
    settings.defaultConnections || 64;
  openDialog($modalSettings);
  document.getElementById("settings-dir").focus();
}

function hideSettings() {
  closeDialog($modalSettings);
}

async function saveSettings() {
  const settings = {
    downloadDir: document.getElementById("settings-dir").value,
    maxConcurrent: parseInt(
      document.getElementById("settings-concurrent").value,
      10,
    ),
    defaultConnections: parseInt(
      document.getElementById("settings-connections").value,
      10,
    ),
  };
  await window.tdm.updateSettings(settings);
  hideSettings();
  notify("Preferences saved");
}

// ===== CLIPBOARD TOAST =====
function showClipboardToast(url, headers = {}) {
  clipboardUrl = url;
  clipboardHeaders = headers;
  $toastUrl.textContent = url;
  $clipboardToast.style.display = "";

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $clipboardToast.style.display = "none";
  }, 8000);
}

function hideClipboardToast() {
  $clipboardToast.style.display = "none";
  if (toastTimeout) clearTimeout(toastTimeout);
}

// ===== EVENT LISTENERS =====
// Toolbar
document
  .getElementById("btn-add")
  .addEventListener("click", () => showAddModal());
document.getElementById("btn-resume-all").addEventListener("click", () => {
  runBulk("paused", resumeDownload);
});
document.getElementById("btn-pause-all").addEventListener("click", () => {
  runBulk("downloading", pauseDownload);
});
document.getElementById("btn-retry-all").addEventListener("click", () => {
  runBulk("failed", retryDownload);
});
document.getElementById("btn-clear").addEventListener("click", async () => {
  await window.tdm.clearCompleted();
  // We only filter out completed and cancelled. We KEEP 'failed' to avoid accidental data loss.
  downloads = downloads.filter(
    (d) => d.status !== "completed" && d.status !== "cancelled",
  );
  renderDownloads();
});
document.getElementById("btn-settings").addEventListener("click", showSettings);
document.getElementById("btn-theme").addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
});

// Add modal
document
  .getElementById("modal-add-close")
  .addEventListener("click", hideAddModal);
document
  .getElementById("btn-cancel-add")
  .addEventListener("click", hideAddModal);
document
  .getElementById("btn-analyze")
  .addEventListener("click", () => analyzeUrl($inputUrl.value.trim()));
document.getElementById("input-quality").addEventListener("change", (e) => {
  analyzeUrl($inputUrl.value.trim(), e.target.value);
});
document
  .getElementById("input-connections")
  .addEventListener("change", () =>
    updateAnalyzedConnectionInfo(lastAnalyzedInfo),
  );
document
  .getElementById("input-transfer-mode")
  .addEventListener("change", () =>
    updateAnalyzedConnectionInfo(lastAnalyzedInfo),
  );
document
  .getElementById("btn-start-download")
  .addEventListener("click", startDownload);
$inputUrl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (e.shiftKey) {
      analyzeUrl($inputUrl.value.trim());
    } else {
      startDownload();
    }
  }
});

// Settings modal
document
  .getElementById("modal-settings-close")
  .addEventListener("click", hideSettings);
document
  .getElementById("btn-cancel-settings")
  .addEventListener("click", hideSettings);
document
  .getElementById("btn-save-settings")
  .addEventListener("click", saveSettings);
document
  .getElementById("btn-browse-dir")
  .addEventListener("click", async () => {
    const dir = await window.tdm.selectDirectory();
    if (dir) {
      document.getElementById("settings-dir").value = dir;
    }
  });

// Toast
document.getElementById("toast-download").addEventListener("click", () => {
  hideClipboardToast();
  showAddModal(clipboardUrl, clipboardHeaders);
});
// Sidebar Filters
document.querySelectorAll(".sidebar-item").forEach((item) => {
  item.addEventListener("click", () => {
    document
      .querySelectorAll(".sidebar-item")
      .forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    document
      .querySelectorAll(".sidebar-item")
      .forEach((i) =>
        i.setAttribute("aria-current", i === item ? "page" : "false"),
      );
    currentFilter = item.dataset.filter;
    renderDownloads();
  });
});

// Search
document.getElementById("search-input").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderDownloads();
});

document
  .getElementById("toast-dismiss")
  .addEventListener("click", hideClipboardToast);

// Title bar
document
  .getElementById("btn-minimize")
  .addEventListener("click", () => window.tdm.minimizeWindow());
document
  .getElementById("btn-close")
  .addEventListener("click", () => window.tdm.closeWindow());

// Close modals on overlay click
$modalAdd.addEventListener("click", (e) => {
  if (e.target === $modalAdd) hideAddModal();
});
$modalSettings.addEventListener("click", (e) => {
  if (e.target === $modalSettings) hideSettings();
});

// Close modals on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideAddModal();
    hideSettings();
    hideClipboardToast();
  }
});

// ===== IPC EVENTS =====
const unsubUpdate = window.tdm.onDownloadUpdate((state) => {
  updateDownloadInPlace(state);
});

const unsubClipboard = window.tdm.onClipboardUrl((data) => {
  let url = typeof data === "string" ? data : data.url;
  let headers = typeof data === "string" ? {} : data.headers || {};
  showClipboardToast(url, headers);
});

// When the extension auto-starts a download without showing the modal,
// display a brief "Download Started" notification with the file name.
let autostartToastTimer = null;
const $autostartToast = document.getElementById("autostart-toast");
const $autostartToastName = document.getElementById("autostart-toast-name");

window.tdm.onExtensionDownloadStarted((data) => {
  const name = data.fileName || data.url || "File";
  $autostartToastName.textContent = name;
  $autostartToast.style.display = "";
  if (autostartToastTimer) clearTimeout(autostartToastTimer);
  autostartToastTimer = setTimeout(() => {
    $autostartToast.style.display = "none";
  }, 5000);
});

document
  .getElementById("autostart-toast-dismiss")
  .addEventListener("click", () => {
    $autostartToast.style.display = "none";
    if (autostartToastTimer) clearTimeout(autostartToastTimer);
  });

// ===== WORKSPACE INTERACTIONS =====
async function runBulk(status, action) {
  const results = await Promise.allSettled(
    downloads
      .filter((d) => d.status === status)
      .map((d) => action(d.id, d.url)),
  );
  if (results.some((r) => r.status === "rejected"))
    notify("Some transfers could not be updated. Please try again.");
}
let notificationTimer;
function notify(message) {
  const el = document.getElementById("notification");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
function validateDownloadUrl(url) {
  try {
    if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error();
    document.getElementById("add-error").hidden = true;
    $inputUrl.removeAttribute("aria-invalid");
    return true;
  } catch {
    const el = document.getElementById("add-error");
    el.textContent = "Enter a valid link starting with https:// or http://.";
    el.hidden = false;
    $inputUrl.setAttribute("aria-invalid", "true");
    $inputUrl.focus();
    return false;
  }
}
let returnFocus;
function openDialog(overlay) {
  returnFocus = document.activeElement;
  overlay.style.display = "";
  document.querySelector(".app-shell").inert = true;
  document.querySelector(".sidebar").inert = true;
}
function closeDialog(overlay) {
  if (overlay.style.display === "none") return;
  overlay.style.display = "none";
  document.querySelector(".app-shell").inert = false;
  document.querySelector(".sidebar").inert = false;
  if (returnFocus?.isConnected) returnFocus.focus();
}
document.addEventListener("keydown", (event) => {
  const modal = [$modalAdd, $modalSettings].find(
    (el) => el.style.display !== "none",
  );
  if (modal && event.key === "Tab") {
    const focusable = [
      ...modal.querySelectorAll('button,input,select,[tabindex="0"]'),
    ].filter((el) => !el.disabled && el.getClientRects().length);
    const first = focusable[0],
      last = focusable.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !modal.contains(document.activeElement))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !modal.contains(document.activeElement))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (!(event.ctrlKey || event.metaKey) || modal) return;
  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    showAddModal();
  }
  if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.getElementById("search-input").focus();
  }
  if (event.key === ",") {
    event.preventDefault();
    showSettings();
  }
});
document.getElementById("input-url").addEventListener("input", () => {
  analysisRequest++;
  lastAnalyzedInfo = null;
  $fileInfo.style.display = "none";
  document.getElementById("group-quality").style.display = "none";
  document.getElementById("group-connections").style.display = "block";
  document.getElementById("group-transfer-mode").style.display = "block";
  document.getElementById("btn-analyze").disabled = false;
  document.getElementById("btn-analyze").innerHTML = glyph("retry");
});
document.getElementById("sort-order").addEventListener("change", (event) => {
  sortOrder = event.target.value;
  renderDownloads();
});
document
  .getElementById("empty-add")
  .addEventListener("click", () => showAddModal());
$downloadList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const item = button?.closest("[data-id]");
  if (!item) return;
  const dl = downloads.find((d) => d.id === item.dataset.id);
  if (!dl) return;
  button.disabled = true;
  try {
    switch (button.dataset.action) {
      case "pause":
        await pauseDownload(dl.id);
        break;
      case "resume":
        await resumeDownload(dl.id);
        break;
      case "retry":
        await retryDownload(dl.id, dl.url);
        break;
      case "cancel":
        await cancelDownload(dl.id);
        notify(
          dl.status === "completed"
            ? "Removed from history. Your file is safe."
            : "Download removed",
        );
        break;
      case "mode":
        await switchDownloadMode(dl.id, button.dataset.mode);
        break;
      case "open":
        await openFile(dl.savePath);
        break;
      case "folder":
        await openFolder(dl.savePath);
        break;
    }
  } catch (error) {
    notify(error.message || "Something went wrong. Please try again.");
  } finally {
    button.disabled = false;
  }
});
const speedHistory = Array(30).fill(0);
setInterval(() => {
  const speed = downloads.reduce(
    (sum, d) => sum + (d.status === "downloading" ? d.speed || 0 : 0),
    0,
  );
  speedHistory.push(speed);
  speedHistory.shift();
  const peak = Math.max(...speedHistory, 1);
  const points = speedHistory.map(
    (v, i) =>
      `${((i * 500) / 29).toFixed(1)},${(62 - (v / peak) * 54).toFixed(1)}`,
  );
  document
    .getElementById("chart-line")
    .setAttribute("d", "M" + points.join(" L"));
  document
    .getElementById("chart-area")
    .setAttribute("d", "M0,70 L" + points.join(" L") + " L500,70 Z");
}, 1000);

// ===== INIT =====
(async () => {
  downloads = await window.tdm.getAllDownloads();
  document.querySelector("[data-filter=all]").classList.add("active");
  document
    .querySelector("[data-filter=all]")
    .setAttribute("aria-current", "page");
  downloads.forEach((d, i) => {
    d.__addedOrder = d.__addedOrder || i + 1;
  });
  nextAddedOrder = downloads.length + 1;
  renderDownloads();
})();
