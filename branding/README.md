# App Logo — matt-jones.org (Progressier PWA)

App icon for the Progressier-built app of [matt-jones.org](https://www.matt-jones.org),
derived from the site's baseball wordmark and palette ("A Website about Nothing").

![App logo](app-logo-512.png)

## Files

| File | Purpose |
|------|---------|
| `app-logo.svg` | Vector source of truth (text converted to paths — no font needed) |
| `app-logo-1024.png` | Master raster — **upload this to Progressier** |
| `app-logo-512.png` | Standard PWA icon size |
| `app-logo-maskable-512.png` | Maskable icon — all artwork sits inside the 80% safe-zone circle, so Android's circle/squircle/rounded masks never clip the ball |
| `app-logo-192.png` | Small launcher size (legibility-checked) |
| `make_logo.py` | Generator script (Python: fontTools + cairosvg + Pillow) — regenerates everything |
| `DESIGN-PHILOSOPHY.md` | "Scorecard Modern" — the design philosophy behind the mark |

## Using with Progressier

1. In the Progressier dashboard, go to **App Icons**.
2. Upload `app-logo-1024.png` as the app icon — Progressier generates all
   platform sizes (iOS, Android, favicon) from it.
3. If prompted separately for a **maskable** icon, upload
   `app-logo-maskable-512.png`.
4. Suggested theme/background colors for the manifest:
   - `theme_color`: `#F2F4EC` (paper)
   - `background_color`: `#F2F4EC` (paper)

## Brand palette (from the site)

| Token | Hex | Role |
|-------|-----|------|
| Paper | `#F2F4EC` | Icon background |
| Card | `#FBFCF7` | Ball |
| Stitch | `#CC3B2E` | Outline, seams, lacing |
| Ink | `#171A12` | MJ monogram |
| Grass | `#2F6B45` | Reserved accent (unused in the icon) |

Monogram set in **Big Shoulders Bold** (OFL) — a condensed scoreboard-style
display face matching the site's heavy uppercase headers.

## Regenerating

```bash
pip install fonttools cairosvg pillow
python3 make_logo.py
```
