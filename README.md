# TurboDM 🚀

**TurboDM** is a high-performance, professional-grade Download Manager built for Windows. It features a sleek, neon-inspired UI and a powerful multi-threaded core capable of accelerating downloads with up to 32 parallel connections.

![App Icon](assets/newlogo.jpg)

## ✨ Key Features

- **32-Connection Parallel Engine**: Segmented file downloading for maximum speed.
- **Universal Browser Interception**: Intercepts all browser downloads via a dedicated Chrome extension.
- **Smart Media Capture**: Automatically detects streaming videos (YouTube, Twitter, TikTok, etc.) and offers resolution selection.
- **Automatic Muxing**: Seamlessly merges high-quality video and audio streams using FFmpeg.
- **Universal Extension Interceptor**: The browser extension routes supported downloads into TurboDM for integrated handling.
- **Smart Filename Extraction**: Prioritizes `Content-Disposition` headers and URL decoding to ensure files retain their original names.

## Legal & Responsible Use

- Use TurboDM only for content you own or are authorized to download.
- Users are responsible for compliance with applicable copyright law and platform terms.
- TurboDM is a general-purpose download tool and is not intended for unlawful use.

## 🛠️ Built With

- **Electron**: Main application framework.
- **Vanilla CSS**: Premium UI with glassmorphism and custom animations.
- **yt-dlp**: Powerful streaming media resolution engine.
- **FFmpeg**: Industry-standard audio/video multiplexing.
- **Node.js**: Asynchronous multi-threaded download logic.

## 📦 Installation

To install TurboDM on your device:

1. Download the latest installer from the [Releases](https://github.com/basit-shahid/turbodm/releases/tag/%23IDMALTERNATIVE) page (if hosted).
2. Run `TurboDM Setup 1.1.0.exe`.
3. Follow the setup wizard to create a desktop shortcut.

### Browser Integration

To enable universal download capture:
1. Copy the `browser-extension` folder to your local machine.
2. Go to `chrome://extensions/` in Chrome.
3. Enable **Developer Mode**.
4. Click **Load Unpacked** and select the `browser-extension` folder.

## 🚀 For Developers

To run the project locally or build from source:

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- Git

### Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/turbodm.git

# Install dependencies
npm install
```

### Development
```bash
# Start the application in dev mode
npm start
```

### Download workspace

The Porcelain & Indigo desktop workspace includes light and dark themes, a compact
30-second transfer chart shown during active downloads, status and file-type filters, filename/source search, sorting,
and per-download pause, resume, retry, connection-mode and file actions.
Flat transfer rows keep the main view quiet; the Details drawer contains source,
connection and file controls, and file categories live in the File type menu.

Keyboard shortcuts: **Ctrl/Cmd + N** adds a download, **Ctrl/Cmd + K** focuses
search, **Ctrl/Cmd + ,** opens preferences, and **Escape** closes a dialog.
Clearing completed history keeps downloaded files on disk.

### Validation

```bash
npm run test:parallel-fallback
npm run test:integrity
npm run test:pause-resume-integrity
```

To run the desktop interaction checks, use Node.js 22+ and launch a development
instance with local debugging enabled:

```bash
npm start -- --remote-debugging-port=9222
# In another terminal:
node scripts/test-renderer.mjs
node scripts/test-renderer-download.mjs
```

The first UI suite uses temporary renderer fixtures and reloads the real library
when finished. The second analyzes, downloads, pauses, resumes and verifies a
2 MiB local fixture, then removes its own history and file. It leaves existing
downloads and preferences intact. Set `TURBODM_DEBUG_PORT` for a different debug
port. Set `TURBODM_SCREENSHOT_DIR` to save UI review screenshots. Debugging is
intended for local development only.

On headless Linux, launch Electron with a virtual display. The prepared cloud
machine provides `/workspace/.turbodm-tools/start.sh`; run it with
`--remote-debugging-port=9222` for these checks. This container requires
`--no-sandbox --disable-gpu`; the helper supplies those flags.

### Packaging

Pushes to `main` build a Windows x64 NSIS installer in GitHub Actions. Open the
**Windows installer** workflow and download **TurboDM-Windows-x64** from its
artifacts. The artifact includes the installer and its SHA256 checksum. These
builds are unsigned. The build generates the app icon automatically and installs
verified Windows yt-dlp and FFmpeg binaries.
```bash
# Build the standalone Windows installer
npm run build
```

## 📜 License

This project is licensed under the MIT License - see [LICENSE](LICENSE).

Third-party dependencies are subject to their own terms - see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---
*Created with ❤️ by Abdul basit shahid*

### Browser handoff (1.3.1)

Update both the desktop app and extension. A direct file click stops the page's native
navigation and asks the browser to open the registered `turbodm://` application.
Approve **Open TurboDM**; the app opens its **New download** dialog with the link and
session headers. Nothing is added to the queue until you choose **Start download**.
Chrome/Edge owns the permission prompt and may skip it if you previously chose Always allow.

For downloads created by page scripts, Chrome is paused and an extension handoff page
offers **Open TurboDM** or **Save in browser instead**. The extension never silently
resumes a download on timeout or denial. Transfers that Chrome finishes before its
onCreated event can be paused cannot be rewound. POST-only requests require explicit
browser continuation. Pause capture in the toolbar popup to use normal browser behavior.

Explicit blob/data download anchors can stage generated files up to 32 MiB in memory;
the Start Download dialog must still be confirmed before they are saved. Larger blobs,
private APIs and other browser-owned requests cannot all be replayed outside their page.

Run `npm run test:browser-integration` for handoff regressions. Against a running isolated
test app, set `TURBODM_TEST_USER_DATA` to its user-data directory and run
`npm run test:browser-dialog` to exercise protocol approval, the dialog, and manual HTTP/blob starts.
The browser's native permission prompt itself needs a real Chrome/Edge installation check.

### Version 1.3.1 downloads

The standalone [browser extension ZIP](releases/TurboDM-Browser-Extension-1.3.1.zip)
is included in this repository. Extract it before using Chrome/Edge's Load unpacked.
Tagged `v*` pushes build and publish the matching Windows installer, extension and checksums.
