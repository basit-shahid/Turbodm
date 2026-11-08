# TurboDM Browser Extension Setup Guide

Thank you for installing TurboDM! 

## Quick Setup Instructions

### For Chrome Users:

1. **Open Chrome Extensions Page:**
   - Click the menu icon (⋮) in the top right
   - Go to **Settings** → **Extensions** → **Manage extensions**
   - Or paste this in address bar: `chrome://extensions`

2. **Enable Developer Mode:**
   - Toggle **Developer mode** in the top right corner (switch should turn blue)

3. **Load Unpacked Extension:**
   - Click **Load unpacked**
   - Navigate to the TurboDM installation folder:
     ```
     C:\Program Files\TurboDM\resources\browser-extension
     ```
   - Select the `browser-extension` folder
   - Click **Open** → **Select Folder**

4. **Done!** 
   - You should see the TurboDM extension in your extensions list
   - Pin it to your toolbar for easy access

### For Edge Users:

1. **Open Edge Extensions Page:**
   - Click the menu icon (•••) in the top right
   - Go to **Extensions** → **Manage extensions**
   - Or paste this in address bar: `edge://extensions`

2. **Enable Developer mode:**
   - Toggle **Developer mode** in the left sidebar (switch should turn blue)

3. **Load Unpacked Extension:**
   - Click **Load unpacked**
   - Navigate to the TurboDM installation folder:
     ```
     C:\Program Files\TurboDM\resources\browser-extension
     ```
   - Select the `browser-extension` folder
   - Click **Select Folder**

4. **Done!**
   - The TurboDM extension is now active
   - You'll see a download button on video sites

## Features

Once enabled, the TurboDM extension provides:

✅ **Video Downloads** - One-click download from YouTube, Twitch, Vimeo, and more  
✅ **Direct Downloads** - Download files using TurboDM instead of browser  
✅ **Better Speed** - Leverage TurboDM's multi-connection downloading  
✅ **Smart Selection** - Automatically detects downloadable files  

## Troubleshooting

**Extension not showing?**
- Make sure Developer mode is enabled
- Verify the extension folder path is correct
- Restart your browser

**Downloads not working?**
- Ensure TurboDM application is running
- Check that TurboDM is listening on port 10101
- Open the extension popup: it should show **Desktop connected**.
- Use the right-click **Download with TurboDM** command or paste an HTTP link in the popup.
- After upgrading TurboDM, reload the extension in Chrome/Edge and accept its updated permissions.

**Need Help?**
- Check the TurboDM application logs
- Verify browser-extension folder contains manifest.json
- Restart TurboDM and your browser

---

**Happy downloading!** 🚀

## Capture and chatbot files

Keep TurboDM running. The extension pauses HTTP downloads and cancels them only after
TurboDM accepts them. Rejected handoffs resume in the browser; the browser download UI
stays available. Pause capture from the toolbar popup when needed.

Explicit `download` links using blob/data URLs can import generated files up to 32 MiB
into TurboDM. Bigger generated files, POST responses, and browser-owned blob downloads
stay in Chrome/Edge. Sites using private APIs, one-use URLs, DRM, or inaccessible page
storage cannot all be replayed by a desktop downloader. Use the browser fallback for them.
Cookies and authorization are forwarded for the matching source origin, kept in memory,
and stripped on cross-origin redirects. After restarting the app, protected downloads
may need to be captured again from the signed-in page.

The popup and video button use the desktop workspace's porcelain/indigo palette, typography,
rounded controls and light/dark themes. The popup follows the desktop theme on opening
unless a browser theme was explicitly chosen.
