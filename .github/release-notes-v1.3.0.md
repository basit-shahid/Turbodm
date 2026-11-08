TurboDM 1.3.0 includes the Porcelain & Indigo desktop UI and updated browser integration.

Download **TurboDM Setup 1.3.0.exe** for Windows x64. Download **TurboDM-Browser-Extension-1.3.0.zip** separately for Chrome/Edge. Checksums are in **SHA256SUMS.txt**.

To install the extension: extract its ZIP, remove the old TurboDM extension, enable Developer mode on chrome://extensions or edge://extensions, click Load unpacked, and select the extracted browser-extension folder. Keep TurboDM open and refresh chatbot tabs.

Changes: compact transfer rows, light/dark themes, details drawer, file-type menu, matching icons, acknowledged browser handoff with Chrome fallback, improved authenticated redirects, and generated-file imports.

Explicit blob/data download anchors import files up to 32 MiB. Larger generated files, POST responses and browser-owned requests retain the browser fallback. Universal compatibility with every chatbot link is not guaranteed.

This installer is unsigned. Windows CI builds the package, checks Windows media tools, and runs engine/integration tests. Native interactive install/uninstall and real authenticated chatbot capture remain unverified.
