<img src="browser-extension/icon-128.png" width="72" alt="TurboDM logo">

# TurboDM

**Version 1.3.1** — A Windows download manager with a minimal Porcelain & Indigo workspace, parallel transfers, and Chrome/Edge integration that puts you in control of when downloads start.

## Download

| Package | Link |
| --- | --- |
| Windows x64 installer | [TurboDM.Setup.1.3.1.exe](https://github.com/basit-shahid/Turbodm/releases/download/v1.3.1/TurboDM.Setup.1.3.1.exe) |
| Chrome / Edge extension | [TurboDM-Browser-Extension-1.3.1.zip](https://github.com/basit-shahid/Turbodm/releases/download/v1.3.1/TurboDM-Browser-Extension-1.3.1.zip) |
| SHA-256 checksums | [SHA256SUMS.txt](https://github.com/basit-shahid/Turbodm/releases/download/v1.3.1/SHA256SUMS.txt) |

See the [1.3.1 release notes](https://github.com/basit-shahid/Turbodm/releases/tag/v1.3.1) or [all releases](https://github.com/basit-shahid/Turbodm/releases). The installer is unsigned. **Update both the desktop app and extension** to use the latest handoff flow.

## What's new in 1.3.1

- **Permission before handoff:** direct file clicks request the browser's permission to open TurboDM.
- **Confirm before downloading:** TurboDM opens a prefilled New download dialog; the transfer starts only after you choose Start download.
- **No silent fallback:** ignored or denied permission does not automatically resume a paused browser download or start a desktop transfer.
- **Generated-file confirmation:** supported blob/data downloads are staged in memory and saved only after confirmation in the app.
- **Matching browser integration:** the extension popup, handoff page and icons follow the desktop design.

## A quieter download workspace

Porcelain & Indigo replaces the earlier green styling with off-white surfaces, charcoal text and restrained indigo accents. Dark mode uses graphite surfaces and soft periwinkle accents.

Compact transfer rows show the filename, status, transferred size, progress and primary action. The Details drawer holds source, connection and file controls. File categories live in the File type menu, and a compact 30-second speed chart appears during active transfers. Decorative dots, promotional cards and repeated transfer indicators have been removed.

The workspace includes search, sorting, status filters, pause/resume, retry, bulk controls and preferences. Clearing completed history removes its entries without deleting downloaded files.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd + N | New download |
| Ctrl/Cmd + K | Search downloads |
| Ctrl/Cmd + , | Preferences |
| Escape | Close the current dialog |

## Install the app and extension

1. Run the Windows x64 installer above and complete setup. Installing registers the `turbodm://` application protocol.
2. Download and extract the extension ZIP.
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
4. Remove the old TurboDM extension, then enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted **browser-extension** folder—not the ZIP or an individual file.
6. Pin the extension and refresh existing browser tabs, including chatbot tabs.

You can also load `<TurboDM installation folder>\resources\browser-extension`. Right-click the TurboDM shortcut and choose Open file location to locate the installation. See the [extension setup guide](build/EXTENSION_SETUP.md) for more details.

## Browser download flow

**Click a direct file link → approve Open TurboDM → review New download → choose Start download.**

The extension stops the normal navigation for recognized direct file links. TurboDM can launch from a closed state or come to the front when already running. The link and available session headers populate the dialog; nothing enters the queue until you confirm.

Chrome/Edge controls the external-application permission prompt. If you previously selected **Always allow**, the browser may open TurboDM without asking again; the extension cannot force that prompt to reappear.

For downloads created by page scripts, the extension pauses Chrome and opens a handoff page. Choose **Open TurboDM** there, or explicitly choose **Save in browser instead**. Timeout or denied permission never silently resumes Chrome. To use normal browser behavior, pause capture in the extension popup.

You can also paste an HTTP link in the popup, use **Download with TurboDM** from the context menu, or use the video overlay on supported pages. These paths request a handoff instead of silently starting a transfer.

### Chatbot files and compatibility limits

- Explicit blob/data download anchors can stage generated files up to **32 MiB** in memory. You must still confirm in the desktop dialog before saving.
- POST-only downloads require explicit browser continuation. Larger blobs, private APIs, browser-only storage and some one-use links may also need the browser.
- A small file that Chrome finishes before its pause API can run cannot be rewound.
- Available cookies, authorization, user-agent and referrer headers help with authenticated links. Session credentials are kept in memory and stripped on cross-origin redirects; protected links may need recapturing after restarting the app.
- Streaming media uses yt-dlp and FFmpeg for supported sites and formats. Site changes, login requirements and access restrictions can affect availability.

TurboDM does not guarantee capture from every chatbot or every downloadable URL.

## Download engine

- Configurable parallel transfers with automatic single-connection fallback when range responses are unreliable.
- Pause, resume, retry and queued transfers.
- Redirect handling and metadata fallback for servers that reject HEAD requests.
- Server-provided filenames and file-type organization.
- yt-dlp media extraction and FFmpeg merging for supported media.

## Development

Built with Electron, Node.js, HTML/CSS/JavaScript, yt-dlp and FFmpeg.

### Prerequisites and setup

Use **Node.js 22+** and Git. Windows is the installer target. Electron development and local fixture tests can also run on Linux with a display server.

```bash
git clone https://github.com/basit-shahid/Turbodm.git
cd Turbodm
npm ci
npm start
```

Dependency installation needs access to npm and the GitHub release assets used by Electron and the media tools. The [Windows workflow](.github/workflows/windows-installer.yml) documents the pinned yt-dlp download and checksum verification used for release builds.

### Engine and handoff tests

```bash
npm run test:browser-integration
npm run test:parallel-fallback
npm run test:integrity
npm run test:pause-resume-integrity
```

The handoff suite checks protocol approval, dialog-only staging, duplicate suppression, blocked legacy auto-start endpoints, authenticated redirects, and explicit browser continuation.

### Desktop interaction tests

Start an isolated test instance with local debugging enabled:

```bash
npm start -- --remote-debugging-port=9222 --user-data-dir=/absolute/path/to/test-profile
```

In Preferences, choose a writable download folder for that test profile. In another terminal:

```bash
node scripts/test-renderer.mjs
node scripts/test-renderer-download.mjs
```

For the protocol/dialog suite, set `TURBODM_TEST_USER_DATA` to the **same absolute test-profile path**, then run:

```bash
npm run test:browser-dialog
```

That suite uses a second Electron instance to simulate an approved OS protocol launch and verifies that HTTP and generated-file downloads wait for confirmation. The renderer suite covers 11 interaction/layout checks, including the details drawer, keyboard focus and 800×600 / 1180×800 layouts. The download suite verifies a real 2 MiB fixture through pause/resume and removes its own file and history entry.

Set `TURBODM_DEBUG_PORT` to use a different debug port or `TURBODM_SCREENSHOT_DIR` to save UI screenshots. Debugging is for local development; keep its port private. On headless Linux, use a virtual display. The prepared cloud workspace provides `/workspace/.turbodm-tools/start.sh`, including the container-specific Electron flags, for this purpose.

### Build and releases

```bash
npm run build -- --publish never
```

The Windows build generates the desktop and extension icons and creates an x64 NSIS installer in `dist/`. Use Windows for the standard packaging workflow.

Pushes to `main` run the [Windows installer workflow](.github/workflows/windows-installer.yml). Tagged `v*` pushes build and publish the matching installer, extension ZIP, blockmap and SHA-256 checksums after the checks pass. The tag must match `package.json`, and a matching release-notes file must exist under `.github/`.

**Validation status for 1.3.1:** Windows CI passed media-tool checks and engine/handoff tests. Linux checks passed the desktop interaction tests, manual HTTP/blob confirmation flow and app-closed protocol startup. The native Chrome/Edge permission UI on Windows and interactive install/uninstall still require manual validation.

## Responsible use and license

Download only content you own or are authorized to download, and follow the applicable platform terms and laws.

TurboDM source is licensed under [MIT](LICENSE). Bundled dependencies have their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md), including the FFmpeg distribution notice.

Created by Abdul Basit Shahid.
