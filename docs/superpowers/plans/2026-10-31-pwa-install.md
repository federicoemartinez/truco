# Instalar el juego en el celu (PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Instalalo en tu celu" button in the menu that, on Android Chrome, opens Chrome's own install dialog, so the game lands on the home screen with its icon and opens full screen like an app.

**Architecture:** The page becomes an installable PWA: a web app manifest with maskable PNG icons (the ancho de espada of the favicon on the green felt) and a minimal service worker that caches nothing. A small `src/install.ts` holds Chrome's `beforeinstallprompt` event; the menu shows the button only while that event is held, so it never appears where installing is impossible (iPhone, desktop Firefox, already installed, inside a portal's iframe).

**Tech Stack:** TypeScript, Vite 8 (`base: './'`), Node's built-in test runner (`node --test`, tests in TypeScript run directly by Node), ImageMagick `convert` (already installed) to rasterize the icon once.

**Spec:** No separate spec file: the design was agreed in chat on 2026-10-31 and is fully captured in Goal, Architecture and Global Constraints here.

## Global Constraints

- Branch: `feat/pwa-install`, which starts from `feat/favicon` (it reuses `public/favicon.svg`'s sword). If `feat/favicon` was already merged when you start, rebase onto `master` first: `git rebase master`.
- Identifiers and comments in English; every text the player sees in rioplatense Spanish (voseo).
- Button label, exact: `Instalalo en tu celu`.
- No new npm dependencies.
- Every URL in the manifest and in `index.html` is relative (`./…` or bare names), never starting with `/`: the game is served from `https://federicoemartinez.github.io/truco/` and from portals' subfolders.
- Colors: theme `#1d6b45` (`--felt` in `style.css`), background `#13492f` (`--felt-dark`).
- Nothing at all on iPhone/Safari: no button, no hint.
- The service worker caches nothing (no offline mode): a cache would serve stale builds after each deploy.
- Inside an iframe (CrazyGames and other portals) neither register the service worker nor show the button.
- Match the surrounding code: terse comments that explain why, short functions, `ponytail:` comments on deliberate shortcuts.
- Commit messages follow the repo's style, e.g. `feat: …` / `fix: …`, one line in plain English.
- Push with the personal key, never fail silently on a passphrase prompt:
  `GIT_SSH_COMMAND="ssh -i ~/.ssh/id_federicoemartinez_gitub -o IdentitiesOnly=yes -o BatchMode=yes" git push -u origin feat/pwa-install`
  If that fails with a permission/passphrase error, stop and ask the user to run `ssh-add ~/.ssh/id_federicoemartinez_gitub`.
- Never `gh pr create` (gh is logged in as the work account). Give the user this link instead:
  `https://github.com/federicoemartinez/truco/compare/master...feat/pwa-install?quick_pull=1&title=Instalar%20el%20juego%20en%20el%20celu%20(PWA)`

## Review Focus

- **Served from `/truco/`, not `/`:** a leading `/` in the manifest's `start_url`, `scope` or icon `src` would install an app that opens `github.io/` and 404s. Pinned by the relative-URL assertions in Task 1's test.
- **Opened inside a portal's iframe:** no service worker registration and no button. Pinned by the `window.top !== window` guard in Task 2, checked by hand in Task 3 Step 3.
- **The player dismisses Chrome's dialog:** the button must not stay on screen as a dead button (the held event can only be used once). Task 2 drops the event before calling `prompt()` and refreshes the button.
- **Browsers without the event (iPhone, Firefox, already installed):** the button never shows and nothing throws; `navigator.serviceWorker` may be undefined (plain `http://` on a LAN IP). Task 2 uses optional chaining and starts with the button `hidden`.
- **Maskable crop:** Android crops the icon to a circle or squircle covering the central 80%; the card must stay inside it. Task 1 checks the geometry and shows a cropped preview.

---

### Task 1: Installable metadata: icons, manifest and links

**Files:**
- Create: `public/icon.svg` (source of the app icon)
- Create: `public/icon-192.png`, `public/icon-512.png` (generated from `icon.svg`, committed)
- Create: `public/manifest.webmanifest`
- Modify: `index.html` (head: add manifest link and theme-color)
- Test: `test/pwa.test.ts`

**Interfaces:**
- Consumes: the sword drawing in `public/favicon.svg` (from `feat/favicon`).
- Produces: `./manifest.webmanifest` linked from `index.html`; icons at `./icon-192.png` and `./icon-512.png`. Task 2 does not depend on names here, only on the page being installable.

- [ ] **Step 1: Write the failing test**

Create `test/pwa.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))

// Width and height from a PNG's IHDR chunk, right after the 8-byte signature and the chunk header
function pngSize(bytes: Buffer): [number, number] {
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

test('the manifest makes the game installable from its own subfolder', () => {
  const m = JSON.parse(read('public/manifest.webmanifest').toString())
  assert.equal(m.name, 'Truco')
  assert.equal(m.display, 'standalone')
  for (const url of [m.start_url, m.scope, ...m.icons.map((i: { src: string }) => i.src)]) {
    assert.ok(!url.startsWith('/'), `${url}: relative, the game lives under /truco/`)
  }
  for (const size of [192, 512]) {
    const icons = m.icons.filter((i: { sizes: string }) => i.sizes === `${size}x${size}`)
    assert.deepEqual(icons.map((i: { purpose: string }) => i.purpose).sort(), ['any', 'maskable'])
    for (const icon of icons) {
      assert.equal(icon.type, 'image/png')
      assert.deepEqual(pngSize(read(`public/${icon.src}`)), [size, size])
    }
  }
})

test('the page links the manifest and the theme color', () => {
  const html = read('index.html').toString()
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/)
  assert.match(html, /<meta name="theme-color" content="#1d6b45" \/>/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/pwa.test.ts`
Expected: FAIL, `ENOENT: no such file or directory, open '…/public/manifest.webmanifest'`.

- [ ] **Step 3: Draw the app icon**

Create `public/icon.svg`. It is the favicon's card and sword on the felt, full bleed, scaled so the card sits inside the maskable safe zone (the central circle of radius 40% of the side). The card spans 59% of the height, and its corners lie at about 37.5% of the side from the center:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <!-- The app icon: the favicon's ancho de espada on the felt, inside Android's maskable safe zone -->
  <rect width="40" height="40" fill="#1d6b45"/>
  <g transform="translate(7.6 7.6) scale(.62)">
    <rect x="5" y="1" width="30" height="38" rx="4" fill="#fffdf6" stroke="#c9b98f" stroke-width="1.5"/>
    <g transform="translate(2 1.5) scale(.9)">
      <path d="M20 1L24 7V26H16V7Z" fill="#9db9df" stroke="#2b4a78" stroke-width="1.5"/>
      <rect x="9" y="26" width="22" height="4" rx="2" fill="#e8b931" stroke="#9a6b00"/>
      <rect x="17.5" y="30" width="5" height="6" fill="#7a4a1f"/>
      <circle cx="20" cy="37.5" r="2.3" fill="#e8b931" stroke="#9a6b00"/>
    </g>
  </g>
</svg>
```

- [ ] **Step 4: Rasterize it**

Run (both verified to work on this machine with ImageMagick's built-in SVG renderer):

```bash
convert -background none -density 1200 public/icon.svg -resize 192x192 public/icon-192.png
convert -background none -density 1200 public/icon.svg -resize 512x512 public/icon-512.png
file public/icon-192.png public/icon-512.png
```

Expected: `PNG image data, 192 x 192` and `PNG image data, 512 x 512`.

Check the maskable crop by eye: make a circle-cropped preview and Read it (the whole card must be visible):

```bash
convert public/icon-512.png \( -size 512x512 xc:none -fill white -draw "circle 256,256 256,51" \) -compose DstIn -composite /tmp/icon-crop.png
```

- [ ] **Step 5: Write the manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "Truco",
  "short_name": "Truco",
  "description": "Truco argentino mano a mano contra la máquina",
  "lang": "es-AR",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#13492f",
  "theme_color": "#1d6b45",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

(`any` and `maskable` go in separate entries: a combined `"any maskable"` makes Chrome warn.)

- [ ] **Step 6: Link it from the page**

In `index.html`, right after the favicon line `<link rel="icon" href="./favicon.svg" type="image/svg+xml" />`, add:

```html
  <link rel="manifest" href="./manifest.webmanifest" />
  <meta name="theme-color" content="#1d6b45" />
```

- [ ] **Step 7: Run the tests and the build**

Run: `node --test test/pwa.test.ts && npm test && npm run build && ls dist/manifest.webmanifest dist/icon-192.png dist/icon-512.png && grep -o 'rel="manifest"[^>]*' dist/index.html`
Expected: all tests PASS; the three files listed; `rel="manifest" href="./manifest.webmanifest" /` (Vite copies `public/` as is and keeps the relative link).

- [ ] **Step 8: Commit**

```bash
git add public/icon.svg public/icon-192.png public/icon-512.png public/manifest.webmanifest index.html test/pwa.test.ts
git commit -m "feat: a web app manifest and the ancho de espada as app icon, so phones can install the game"
```

---

### Task 2: The install button

**Files:**
- Create: `public/sw.js`
- Create: `src/install.ts`
- Modify: `src/texts.ts` (`T`: add `install`)
- Modify: `src/ui.ts` (menu markup in `showMenu`, click handler in `mount`, new export `refreshInstall`)
- Modify: `src/main.ts` (call `initInstall`)
- Test: `test/pwa.test.ts` (service worker assertions)

**Interfaces:**
- Consumes: the installable page from Task 1.
- Produces, in `src/install.ts`:
  - `initInstall(onChange: () => void): void`: registers `./sw.js` and listens for Chrome's events; calls `onChange` whenever `canInstall()` may have changed.
  - `canInstall(): boolean`: true while Chrome's install prompt is held.
  - `install(): Promise<void>`: shows Chrome's dialog once; afterwards `canInstall()` is false.
- Produces, in `src/ui.ts`: `refreshInstall(): void`: shows or hides the menu's install button from `canInstall()`.

- [ ] **Step 1: Write the failing test**

Append to `test/pwa.test.ts`:

```ts
test('the service worker only exists for Chrome to offer the install: a fetch handler that caches nothing', () => {
  const sw = read('public/sw.js').toString()
  assert.match(sw, /addEventListener\('fetch'/)
  assert.doesNotMatch(sw, /caches\./)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/pwa.test.ts`
Expected: FAIL, `ENOENT … public/sw.js`.

- [ ] **Step 3: Write the service worker**

Create `public/sw.js`:

```js
// Only here so Chrome offers to install the game, which asks for a fetch handler. It caches nothing on
// purpose: every request goes to the network, so a new deploy is never hidden behind a stale copy
self.addEventListener('fetch', () => {})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/pwa.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Hold Chrome's install prompt**

Create `src/install.ts`:

```ts
// Android Chrome's own "install app" dialog, opened from a menu button instead of its banner.
// Chrome fires beforeinstallprompt only where installing is possible: not on iPhone, not once installed
type InstallPrompt = Event & { prompt(): Promise<void> }

let held: InstallPrompt | null = null

export function initInstall(onChange: () => void) {
  if (window.top !== window) return // inside a portal's iframe: their page, not ours to install
  navigator.serviceWorker?.register('./sw.js').catch((err) => console.warn(err)) // undefined over plain http
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // no banner of Chrome's own: the menu button offers it
    held = e as InstallPrompt
    onChange()
  })
  window.addEventListener('appinstalled', () => {
    held = null
    onChange()
  })
}

export const canInstall = () => held !== null

// A held prompt works once: drop it first, so a dismissed dialog doesn't leave a dead button behind.
// Chrome fires beforeinstallprompt again later if installing is still possible
export async function install() {
  const prompt = held
  held = null
  await prompt?.prompt()
}
```

- [ ] **Step 6: The button text**

In `src/texts.ts`, in `T`, after `knows: 'Lo que Bruno sabe de vos',` add:

```ts
  install: 'Instalalo en tu celu',
```

- [ ] **Step 7: The button in the menu**

In `src/ui.ts`:

1. Add the import next to the `voice.ts` one:

```ts
import { canInstall, install } from './install.ts'
```

2. In `mount`'s click `switch`, next to `case 'knows': …`, add:

```ts
      case 'install':
        void install().then(refreshInstall)
        return
```

3. In `showMenu`, right after `<button data-do="knows">${T.knows}</button>`, add:

```ts
      <button data-do="install"${canInstall() ? '' : ' hidden'}>${T.install}</button>
```

4. Add this exported function after `showMenu`:

```ts
// Chrome says when the game can be installed, at any moment: show or hide the menu's button then
export function refreshInstall() {
  root.querySelector('[data-do="install"]')?.toggleAttribute('hidden', !canInstall())
}
```

(The `hidden` attribute is enough: no menu button rule sets `display`. If you add one, add `.menu [hidden] { display: none; }` too.)

- [ ] **Step 8: Wire it**

In `src/main.ts`:

1. Change the ui import to also take `refreshInstall`:

```ts
import { mount, refreshInstall, renderGame, showMenu } from './ui.ts'
```

2. Add the import:

```ts
import { initInstall } from './install.ts'
```

3. At the end of the file, after `portal.init()`, add:

```ts
initInstall(refreshInstall)
```

- [ ] **Step 9: Typecheck, test, build**

Run: `npm run check && npm test && npm run build && ls dist/sw.js`
Expected: no type errors; all tests PASS; `dist/sw.js` listed.

- [ ] **Step 10: Commit**

```bash
git add public/sw.js src/install.ts src/texts.ts src/ui.ts src/main.ts test/pwa.test.ts
git commit -m "feat: an \"Instalalo en tu celu\" button in the menu that opens Chrome's install dialog, shown only where it can"
```

---

### Task 3: Check it by hand and ship

**Files:** none changed, unless a check fails.

- [ ] **Step 1: The menu still renders without the button**

Run `npm run dev` in the background, then screenshot the menu at phone size with Firefox headless (Firefox never fires `beforeinstallprompt`, so this is the "not installable" case):

```bash
firefox --headless --profile shots/.ff --window-size=412,860 --screenshot /tmp/menu.png http://localhost:5173/
```

Read `/tmp/menu.png`. Expected: the menu as before, with **no** "Instalalo en tu celu" button and no gap where it would be.

- [ ] **Step 2: No errors in the console**

Expected: in a desktop browser at `http://localhost:5173/`, the devtools console shows no errors (the service worker registers on localhost; a warning, not an error, is acceptable on a LAN IP over plain http).

- [ ] **Step 3: The portal guard**

Create `/tmp/frame.html` with `<iframe src="http://localhost:5173/" width="412" height="860"></iframe>`, open it in a desktop Chrome, and in devtools → Application → Service workers check that **no** worker is registered for `localhost:5173` from the iframe (unregister any left from Step 2 first).

- [ ] **Step 4: Push and hand over the PR link**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_federicoemartinez_gitub -o IdentitiesOnly=yes -o BatchMode=yes" git push -u origin feat/pwa-install
```

Give the user the PR link from Global Constraints, and tell them what can only be checked after the merge deploys to `https://federicoemartinez.github.io/truco/` (Chrome requires HTTPS):

1. On the Pixel, in Chrome, open the page and wait about 30 seconds while tapping around (Chrome's engagement check). The "Instalalo en tu celu" button appears in the menu.
2. Tapping it opens Chrome's "Instalar app" dialog. Dismiss it once: the button disappears.
3. Install it: the ancho de espada icon is on the home screen, and it opens full screen, with no browser bar.
4. Optionally, in desktop Chrome devtools → Application → Manifest, the "Installability" section lists no errors.

If step 1 never shows the button and devtools' Installability section complains about the service worker, replace the no-op handler in `public/sw.js` with a pass-through: `self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)))`.
