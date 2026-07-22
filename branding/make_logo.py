#!/usr/bin/env python3
"""Progressier app icon for matt-jones.org — 'Scorecard Modern', red-field mark.

Full-bleed stitch-red field, oversized cream ball knocked out of it, seams
and chevron lacing in the field red, MJ monogram in scoreboard capitals.
Palette from the site CSS: paper #F2F4EC, stitch #CC3B2E.
"""
import math
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen

FONT = "/root/.claude/skills/canvas-design/canvas-fonts/BigShoulders-Bold.ttf"
OUT = "/home/user/calendar/branding"

PAPER, STITCH = "#F2F4EC", "#CC3B2E"

S = 1024
CX = CY = S / 2
BALL_R = 340
CAP_PX = 205

font = TTFont(FONT)
cap = font["OS/2"].sCapHeight
glyphset = font.getGlyphSet()
cmap = font.getBestCmap()

def glyph_path(ch, dx, dy, scale):
    pen = SVGPathPen(glyphset)
    glyphset[cmap[ord(ch)]].draw(TransformPen(pen, Transform(scale, 0, 0, -scale, dx, dy)))
    return pen.getCommands()

def glyph_bounds(ch):
    bp = BoundsPen(glyphset)
    glyphset[cmap[ord(ch)]].draw(bp)
    return bp.bounds

def monogram(cap_px, cx, baseline_y, fill):
    sc = cap_px / cap
    track = cap_px * 0.13
    mb, jb = glyph_bounds("M"), glyph_bounds("J")
    m_w, j_w = (mb[2] - mb[0]) * sc, (jb[2] - jb[0]) * sc
    total = m_w + track + j_w
    x0 = cx - total / 2
    dm = glyph_path("M", x0 - mb[0] * sc, baseline_y, sc)
    dj = glyph_path("J", x0 + m_w + track - jb[0] * sc, baseline_y, sc)
    return f'<path d="{dm}" fill="{fill}"/>\n<path d="{dj}" fill="{fill}"/>', total

def seam_and_lacing(cx_ball, cy_ball, r_ball, color, seam_w=13, lace_w=7.5,
                    n=7, chord_frac=0.60, bulge=55):
    """Two seams bulging toward the ball's edges, with chevron lacing."""
    half_chord = r_ball * math.cos(math.asin(chord_frac))
    chord_off = r_ball * chord_frac
    r_arc = (bulge**2 + half_chord**2) / (2 * bulge)
    d_center = r_arc - bulge
    parts = []
    for side in (-1, 1):
        xc = cx_ball + side * chord_off
        top, bot = (xc, cy_ball - half_chord), (xc, cy_ball + half_chord)
        cx_arc = xc - side * d_center
        th_top = math.atan2(top[1] - cy_ball, top[0] - cx_arc)
        th_bot = math.atan2(bot[1] - cy_ball, bot[0] - cx_arc)
        if side < 0:  # left arc spans the ±180° seam; wrap for interpolation
            th_top %= 2 * math.pi
            th_bot %= 2 * math.pi
        sweep = 1 if side > 0 else 0
        parts.append(f'<path d="M {top[0]:.1f} {top[1]:.1f} A {r_arc:.1f} {r_arc:.1f} 0 0 {sweep} '
                     f'{bot[0]:.1f} {bot[1]:.1f}" fill="none" stroke="{color}" '
                     f'stroke-width="{seam_w}" stroke-linecap="round"/>')
        segs = []
        sc = r_ball / 300.0
        apex_out, end_in, half_w = 12 * sc, 15 * sc, 14 * sc
        for i in range(n):
            f = 0.13 + 0.74 * i / (n - 1)
            th = th_top + (th_bot - th_top) * f
            px, py = cx_arc + r_arc * math.cos(th), cy_ball + r_arc * math.sin(th)
            rx, ry = math.cos(th), math.sin(th)
            tx, ty = -math.sin(th), math.cos(th)
            ax, ay = px + rx * apex_out, py + ry * apex_out
            e1 = (px - rx * end_in + tx * half_w, py - ry * end_in + ty * half_w)
            e2 = (px - rx * end_in - tx * half_w, py - ry * end_in - ty * half_w)
            segs.append(f"M {e1[0]:.1f} {e1[1]:.1f} L {ax:.1f} {ay:.1f} L {e2[0]:.1f} {e2[1]:.1f}")
        parts.append(f'<path d="{" ".join(segs)}" fill="none" stroke="{color}" '
                     f'stroke-width="{lace_w * sc:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
    return "\n".join(parts)

mj, mj_w = monogram(CAP_PX, CX, CY + CAP_PX / 2, STITCH)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <!-- Scorecard Modern (red field) — app icon for matt-jones.org -->
  <rect width="{S}" height="{S}" fill="{STITCH}"/>
  <circle cx="{CX}" cy="{CY}" r="{BALL_R}" fill="{PAPER}"/>
{seam_and_lacing(CX, CY, BALL_R, STITCH)}
{mj}
</svg>'''

with open(f"{OUT}/app-logo.svg", "w") as f:
    f.write(svg)

import cairosvg
from PIL import Image

cairosvg.svg2png(bytestring=svg.encode(), write_to=f"{OUT}/app-logo-1024.png",
                 output_width=1024, output_height=1024)
img = Image.open(f"{OUT}/app-logo-1024.png").convert("RGB")
for size, name in [(512, "app-logo-512.png"), (192, "app-logo-192.png"),
                   (512, "app-logo-maskable-512.png")]:
    img.resize((size, size), Image.LANCZOS).save(f"{OUT}/{name}")

print(f"monogram width {mj_w:.0f}px; ball radius {BALL_R} vs maskable safe {0.4 * S:.0f}")
