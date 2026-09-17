# Video Production — PrintSafe Marketing Videos

How the PrintSafe launch/explainer videos were made, and how to make more.
Everything here runs **locally and free** — no paid API, no account, no upload.

---

## What exists

| Video | Folder | Size | Len | Use |
|-------|--------|------|-----|-----|
| Launch cut (comedic) | `brag-output/` | 1920×1080 | 21s | General launch post |
| Social cut | `brag-output-vertical/` | 1080×1920 | 21s | Reels / Shorts / WhatsApp Status |
| Architecture film | `brag-output-technical/` | 1920×1080 | 20.5s | Website hero / LinkedIn |
| Tech explainer (silent) | `brag-output-explainer/brag-explainer.mp4` | 1920×1080 | 31s | "Can you see my docs?" |
| Tech explainer (narrated) | `brag-output-explainer/brag-explainer-voiced.mp4` | 1920×1080 | 52s | Same, with voiceover |

Each folder holds: the `.mp4`, a `.jpg` poster (also baked as frame 0),
`share-copy.txt`, and `composition/` — the editable source project.

**These are not AI-generated video.** Each one is an HTML page animated with
GSAP, screenshotted frame-by-frame in headless Chrome, and encoded by FFmpeg.
Fully deterministic and re-renderable: change a color or a timestamp in
`composition/index.html` and re-run render.

---

## Tooling

- **Hyperframes** (`npx hyperframes`) — HTML → MP4 renderer. Free, local, no account.
  (It mentions HeyGen sign-in; that's only for optional cloud render/avatars. Not used.)
- **`/brag` skill** — installed at `~/.agents/skills/brag`, symlinked into `~/.claude/skills/`.
  Generates the plan → brief → composition → render pipeline.
- **Hyperframes domain skills** — `hyperframes-core`, `-animation`, `-creative`,
  `-keyframes`, `-cli`. Install/refresh: `npx hyperframes skills update`.

### Environment gotchas on this machine

```bash
# FFmpeg is NOT on system PATH and there is no Homebrew.
# It lives in the youtube conda env — export this before ANY hyperframes command:
export PATH="/Users/vishal/miniforge3/envs/youtube/bin:$PATH"
```

- 8 GB RAM total, usually ~1.5 GB free → **always render with `--low-memory-mode --workers 1`**.
  Renders still only take ~20–35 s. Do multiple videos one at a time, not in parallel.
- Chrome Headless Shell is cached at `~/.cache/hyperframes/chrome/` (93 MB, already downloaded).
- Docker / whisper-cpp / MusicGen are listed as missing by `hyperframes doctor` — all optional, not needed.

---

## The pipeline

```bash
export PATH="/Users/vishal/miniforge3/envs/youtube/bin:$PATH"
cd brag-output-<name>/composition

npx hyperframes check                  # lint + runtime + layout + motion + WCAG contrast
npx hyperframes snapshot . --at 1,5,10 -o /tmp/shots --no-end   # eyeball frames first
npx hyperframes render -o ../out.mp4 --low-memory-mode --workers 1
```

`check` must be clean before rendering. It catches real bugs — broken
animations, text overflow, and contrast failures.

### Poster frame (do this after every render)

An `.mp4` has no poster attribute, so platforms grab frame 0. Bake the good
frame in so thumbnails aren't a mid-fade:

```bash
ffmpeg -y -ss <good-timestamp> -i out.mp4 -frames:v 1 -q:v 2 -update 1 out.jpg
ffmpeg -y -i out.mp4 -i out.jpg \
  -filter_complex "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]" \
  -map "[v]" -map "0:a?" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p \
  -c:a copy -movflags +faststart p.mp4 && mv p.mp4 out.mp4
```

Quote `"0:a?"` — zsh tries to glob the `?` unquoted and the command dies.

---

## Voiceover (Kokoro TTS)

Local, free, no API. Required one-time setup (already done):

```bash
# isolated venv — does NOT touch the youtube conda env
python3 -m venv ~/.cache/hyperframes-tts
~/.cache/hyperframes-tts/bin/python -m pip install kokoro-onnx soundfile
export HYPERFRAMES_PYTHON=~/.cache/hyperframes-tts/bin/python
```

The 310 MB model download **stalls through the CLI**. It was fetched directly
and is now cached at `~/.cache/hyperframes/tts/models/kokoro-v1.0.onnx`.
If it ever needs re-downloading:

```bash
curl -L -o ~/.cache/hyperframes/tts/models/kokoro-v1.0.onnx \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
```

Generate a line:

```bash
export HYPERFRAMES_PYTHON=~/.cache/hyperframes-tts/bin/python
npx hyperframes tts assets/vo/line1.txt --voice af_heart -o assets/vo/vo1.wav
```

Voices: `af_heart` (used), `af_nova`, `af_sky`, `am_adam`, `am_michael`,
`bf_emma`, `bf_isabella`, `bm_george`, + non-English. To change voice,
re-run against `composition/assets/vo/line1–6.txt` and re-render.

**Narration rules that worked:**
- Generate **one WAV per scene**, not one long file — lets each scene be timed to its own line.
- Let the voice set the pace: measure each WAV, then set scene `data-start`/`data-duration`
  around it. This is why the narrated cut is 52s vs the silent 31s.
- Music ducks to `volume: 0.13` under the voice for the whole runtime.
- Cue reveals to **words, not beats**, once narration exists.
- Spell numbers out ("twenty four hours") so the model doesn't misread numerals.

---

## Design decisions worth keeping

- **Colors/fonts come from `src/app/globals.css`** — sky `#8EC6E8`, yellow `#F5C518`,
  ink `#0D0D0D`; dark theme `#0F1923` / `#1A2636` / `#4A9FD4`. Videos should keep matching
  the real app, so re-check these if the design system changes.
- **White text on sky blue fails WCAG** (1.84:1, needs 3:1) even at 92px. The landscape cut
  uses ink text with a white stamp-shadow instead. `check` will catch this.
- **Fonts must be local files** — no Google Fonts CDN (render must be network-free).
  EB Garamond / Inter / JetBrains Mono woff2 are copied into `composition/assets/fonts/`
  from `~/.claude/skills/hyperframes-creative/frame-presets/code-editorial/fonts/`.
  EB Garamond stands in for the app's Fraunces.
- **Music** is bundled with `/brag`: `happy-beats-business-moves-vol-1` (120.19 BPM,
  credit ende.app). Cue preset with strong beats lives in the skill's `assets/music/cues/`.
  Strong beats at 16.02 / 17.02 / 17.52 / 18.02 / 18.52 make a natural outro reveal cadence.
  Track's driving section ends ~30s — keep non-narrated cuts under that.
- **SFX** from the `/brag` Kenney pack; prefer low high-frequency-risk files for
  anything repeated. Selection guide: `~/.claude/skills/brag/assets/sfx/sfx-analysis.md`.
- All placeholder data in the videos is **fake** — tokens, keys, hex bytes, `AADHAAR_CARD.pdf`.
  Keep it that way; never screenshot a real document or a real key.

---

## Making a new variant

Fastest path is to copy an existing `composition/` (it already has fonts, music,
SFX staged) and edit `index.html`:

1. `cp -R brag-output-technical/composition brag-output-<new>/composition`
2. Change `data-width`/`data-height` + `data-resolution` for a different aspect.
   Portrait needs type scaled up ~25% or content looks lost in the tall frame.
3. Edit scenes (`<section class="clip" data-start data-duration>`) and the GSAP timeline.
4. `check` → `snapshot` → `render` → poster → share copy.

Lint rules that bite: no CSS `transform` on an element you also GSAP-tween
(use `fromTo`); don't repeat `fromTo` on one element without a baseline `tl.set`;
every `<audio>` needs an `id`; no `repeat: -1`; audio `data-duration` must match
the real clip length.

---

## Open items

- **Nobody has listened to the narrated cut yet.** Levels were verified
  programmatically (voice sits ~14 dB above the ducked bed) but pronunciation of
  "AES", "UUID", "PrintSafe" is unconfirmed. Listen before publishing.
- Videos say `printsafe.in` — keep in sync if the domain changes.
- No captions/subtitles burned in yet. `hyperframes transcribe` + the
  `embedded-captions` workflow could add them for silent autoplay feeds.
