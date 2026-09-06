# PocketSplit Audit Fixes

This archive contains the corrected code snippets and files required to patch the PocketSplit application based on the audit.

## Files Included:
1. `sw.js` - The hardened Service Worker (replaces your current sw.js).
2. `pocket-split-fixes.js` - Contains the patched functions (Auth, Math, Date, Form, Import/Export). 
   You can either include this file directly in your `index.html` or merge its contents into your main JavaScript file.
3. `integration-guide.md` - Instructions on how to integrate these fixes into your existing codebase.

## Quick Start
1. Overwrite your existing `sw.js` with the one provided here.
2. Open your `index.html` and add `<script src="pocket-split-fixes.js"></script>` right before your main app.js script.
3. Update your main app script to use `window.POCKETSPLIT_AUTH.isUnlocked` instead of localStorage for the lock screen check.
