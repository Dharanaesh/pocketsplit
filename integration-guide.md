# Integration Guide

Because I cannot directly overwrite your GitHub repository, you will need to manually apply these fixes to your local codebase before pushing to `main`.

### Step 1: Update Service Worker
1. Delete the code in your current `sw.js`.
2. Copy the contents of `sw.js` from this folder into your repository's `sw.js`.
3. Make sure to list all your CSS, JS, and image paths in the `ASSETS` array inside `sw.js` so they cache correctly for offline mode.

### Step 2: Implement Fixes
You have two choices:
**Option A:** Copy `pocket-split-fixes.js` into your `/js` folder and add it to your `index.html`:
```html
<script src="js/pocket-split-fixes.js"></script>
<script src="js/app.js"></script> <!-- Your existing script -->
```

**Option B (Recommended):** Open `pocket-split-fixes.js`, and copy-paste the functions into your existing JavaScript files, replacing the buggy functions.

### Step 3: Remove localStorage lock states
Search your entire codebase for:
`localStorage.setItem('isUnlocked', ...)`
or similar. Delete those lines. The app should ONLY use `window.POCKETSPLIT_AUTH.isUnlocked`.
