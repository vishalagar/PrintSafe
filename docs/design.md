# Design System & UI Screens

## Design Tokens

Use these exact values — do not invent new ones:

```css
--bg: #0D0D0D              /* Cod Gray */
--surface: #151008         /* warm dark surface */
--surface2: #1E1709
--surface3: #271F0C
--green: #DC9D2B           /* Golden Grass — primary accent */
--blue: #9ECEF0            /* Sail — secondary/info */
--orange: #C47B40          /* Russet — commercial mode */
--red: #fb7185             /* danger/delete */

/* Grid background */
background-size: 44px 44px;
color: rgba(187,221,249,0.038);

/* Fonts */
Fraunces        → headings (serif, weight 900/700)
DM Sans         → body text
JetBrains Mono  → tags, labels, code, mono elements
```

Reference files:
- Full design system: `/Users/vishal/Desktop/SafePrint/Design/printsafe-v4.html`
- Color palette: `/Users/vishal/Desktop/SafePrint/Design/colour insipration.jpg`
- Static sample: `/Users/vishal/Desktop/SafePrint/Code/index.html` (open directly in browser)

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
- Accepted: PDF, JPG, PNG, DOCX — up to 25 MB
- Expiry pills: `View once` · `15 min` · `30 min` · `1 hour` (30 min pre-selected)
- CTA: "Encrypt & Create Link" — disabled until file selected, spinner on upload
- Trust row: 🔒 AES-256 encrypted · ✕ No server storage · 🔗 One-time link

**`/share` — Link Ready**
- Full-width read-only link input + copy button
- 256×256 QR code centred — always visible without scrolling on mobile
- WhatsApp share button (deep links to `wa.me`) + Web Share API on mobile
- Expiry badge (amber) + "Track this document →" link to `/status/[token]`

**`/d/[token]` — Document Viewer**
- Slim amber banner: "⚠ This document will be deleted X minutes after you close this tab"
- PDF: rendered via PDF.js (no download button, no toolbar)
- Images: `<img>` with `user-select: none`, no right-click
- Single sticky print button bottom-right: "🖨 Print this document"
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
