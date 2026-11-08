TurboDM 1.3.1 changes browser capture to an explicit permission-and-confirmation flow.

**Update both the installer and extension.**

Click a direct file link → approve the browser's Open TurboDM prompt → TurboDM opens New download → review and choose Start download. Neither the loopback bridge nor blob imports automatically start or save files anymore.

Script-generated downloads pause in Chrome and open an extension handoff page. Choose Open TurboDM or explicitly Save in browser instead. Timeout or denied permission never silently resumes Chrome. Browsers may remember Always allow; TurboDM cannot force that native prompt to reappear.

Generated blob/data anchors stage files up to 32 MiB until you confirm in the app. POST-only requests require the browser. Downloads that finish before Chrome can pause them cannot be rewound.

The Windows CI checks media binaries and engine/handoff regressions. Linux interaction checks exercise actual app dialogs and manual HTTP/blob starts. Real Windows browser permission UI and interactive install/uninstall still need manual validation. Installer is unsigned.

Extract the extension ZIP, remove the old extension, enable Developer mode in chrome://extensions or edge://extensions, then Load unpacked → browser-extension. Refresh chatbot tabs after updating.
