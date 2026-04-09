# Design System & UI Screens

## Design Tokens

Use these exact values — do not invent new ones:

```css
/* Palette — neo-brutalist, light mode */
--bg:       #8EC6E8   /* Sky blue — page background */
--surface:  #FFFFFF   /* White — cards, panels */
--surface2: #EFF7FF   /* Pale blue — hover states */
--surface3: #D8EDFF   /* Slightly deeper — active states */
--text:     #0D0D0D   /* Near-black — text on white surfaces */
--yellow:   #F5C518   /* Yellow — primary CTAs, selected state */
--red:      #fb7185   /* Danger / delete */

/* ⚠️ Text directly on --bg (sky blue) MUST be #FFFFFF — not var(--text) */
/* var(--text) = #0D0D0D in light mode. Use #FFFFFF for hero headings,    */
/* subtitles, and footer text that sit on the sky blue background.        */

/* Dark mode palette (html[data-theme="dark"]) */
--bg:       #0F1923   /* Dark navy */
--surface:  #1A2636
--text:     #F0F4F8
--ink:      #E8EEF4   /* Inverted — borders/shadows in dark */

/* White dot grid overlaid on --bg */
background-size: 44px 44px;

/* Shadow — hard offset, no blur (neo-brutalist) */
--shadow:    5px 5px 0 var(--ink);
--shadow-sm: 3px 3px 0 var(--ink);
--shadow-xs: 2px 2px 0 var(--ink);

/* Borders */
border: 2px solid var(--ink);

/* Fonts — switched to native system stacks (session 8) */
-apple-system, BlinkMacSystemFont, ui-serif → headings
-apple-system, BlinkMacSystemFont, sans-serif → body text
ui-monospace, SFMono-Regular, monospace → tags, labels, mono elements
/* Note: Fraunces/DM Sans/JetBrains Mono references in inline styles remain
   as fallbacks but native fonts load first with zero network cost */
```

### Theme System
- **Default:** Light mode — system `prefers-color-scheme` is intentionally ignored
- **Toggle:** `ThemeToggle.tsx` in nav — writes `'dark'|'light'` to `localStorage('theme')`
- **Persistence:** Survives page reload via blocking script in `layout.tsx` (no FOUC)
- **CSS:** `html[data-theme="dark"]` overrides all tokens; `:root` = light

Reference files:
- Full design system: `/Users/vishal/Desktop/SafePrint/Design/printsafe-v4.html`
- Color palette: `/Users/vishal/Desktop/SafePrint/Design/colour insipration.jpg`
- Tokens in code: `src/app/globals.css` → `@theme inline {}` block

---

## UI Screens (Phase 1 — exactly 4)

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | Upload Page | File picker, expiry selector, encrypt & upload CTA |
| `/share` | Link Ready | Generated link, QR code, WhatsApp share, status link |
| `/d/[token]` | Document Viewer | Decrypt + render PDF/image; one-time; print button |
| `/status/[token]` | Status & Delete | Lifecycle status, countdown, manual delete via `delete_token` |

### Screen Details

**`/` — Upload Page**
- Large drag-and-drop zone (dashed border), click to browse
- Accepted: PDF, JPG, PNG, HEIC — up to 25 MB (DOCX removed — can't render in browser)
- Expiry pills: `View once` · `15 min` · `30 min` · `1 hour` (30 min pre-selected)
- CTA: "Encrypt & Create Link" — disabled until file selected, spinner on upload
- Trust row: 🔒 AES-256 encrypted · ✕ No server storage · 🔗 One-time link
- Live trust counter below hero: "X,XXX+ documents securely shredded" with animated count-up (seeded at 1,000 + real Supabase count)
- Hero text: "Share privately. Delete automatically." (rebranded session 9)
- Footer: "Share privately. Delete automatically." + "Encrypted in browser · Auto-shredded · Zero trace" + "Built by Vishal Agarwal" (LinkedIn)

**`/share` — Link Ready**
- Full-width read-only link input + copy button
- 256×256 QR code centred — always visible without scrolling on mobile
- WhatsApp share button (deep links to `wa.me`) + Web Share API on mobile
- Expiry badge (amber) + "Track this document →" link to `/status/[token]`

**`/d/[token]` — Document Viewer**
- Slim amber banner: "⚠ This document will be deleted X minutes after you close this tab"
- PDF: rendered via PDF.js (no download button, no toolbar)
- Images: `<img>` with `user-select: none`, `pointer-events: none`
- HEIC files: converted to JPEG client-side via `heic2any` before display
- `user-select: none` on entire viewer root — blocks text selection / ctrl+C
- Tiled watermark overlay (`position: fixed; z-index: 500; pointer-events: none`) — diagonal `PrintSafe · {token[-8:]} · Print only` at 8% opacity; hidden in print
- Print: `printPDFViaCanvas()` renders each PDF page to canvas at 2× scale → PNG → hidden iframe → `contentWindow.print()`. No new tab, no Download button, output is rasterized. Waits for all images to load via `Promise.all` before calling `print()` (session 9 fix).
- Print button shows "Print" text (no emoji) + spinner + "Preparing print…" while canvas renders (prevents double-click)
- Already-used state: full-screen "This document has already been opened"

**`/status/[token]` — Status & Delete**
- Colour-coded status badge: 🟡 Pending · 🟢 Viewed · 🔴 Deleted · ⬛ Expired
- Simple vertical timeline with timestamps
- Live countdown if viewed: "Deletes in MM:SS"
- Red "Delete now" button (pending/viewed only) → confirmation modal → uses `delete_token` from localStorage

---

## Mobile-First Rules

- Design mobile layout first, then expand to desktop (most users on Android mid-range)
- Upload zone: full screen height on mobile, 60vh on desktop
- QR code always visible without scrolling on `/share`
- No horizontal scroll anywhere
- Touch targets: minimum 44×44px
- Test on actual Android device before shipping Phase 1
