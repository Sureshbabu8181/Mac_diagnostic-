# One Diagnose - Windows

## Quick Start (3 steps)

### Step 1: Install Node.js
Download from https://nodejs.org/ (LTS version) and install it.

### Step 2: Download this folder
Click green "Code" button → "Download ZIP" → Extract it.

### Step 3: Run setup
Double-click **setup.bat** — it installs everything and opens the app.

---

## Manual Setup
```bash
cd WindowsDiagnosticApp
npm install
npm start
```

## Build Portable .exe
```bash
npm install
npx electron-builder --win portable
```
The .exe will appear in the `dist/` folder.

## Files
- `main.js` - Electron main process
- `preload.js` - Security bridge
- `public/index.html` - App UI (React)
- `assets/icon.ico` - App icon
