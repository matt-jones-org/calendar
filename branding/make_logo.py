#!/usr/bin/env python3
"""Progressier app icon for matt-jones.org — 'Scorecard Modern'.

Paper field, card-white ball, two red seams arcing edge-to-edge with
chevron lacing, MJ monogram in scoreboard capitals. Palette from site CSS:
paper #F2F4EC, card #FBFCF7, ink #171A12, stitch #CC3B2E, grass #2F6B45.
"""
import math
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen

FONT = "/root/.claude/skills/canvas-design/canvas-fonts/BigShoulders-Bold.ttf"
OUT = "/home/user/calendar/branding"

PAPER, CARD, INK, STITCH, GRASS = "#F2F4EC", "#FBFCF7", "#171A12", "#CC3B2E", "#2F6B45"

S = 1024
CX = CY = S / 2
R = 300              # ball radius
BALL_STROKE = 14
A_END = math.asin(0.60)    # seam endpoints, measured from vertical
R_ARC = 551                # seam arc radius (gentle bulge ~55px)
SEAM_W = 12

# ---------------------------------------------------------------- monogram
font = TTFont(FONT)
cap = font["OS/2"].sCapHeight or 700
glyphset = font.getGlyphSet()
cmap = font.getBestCmap()

def glyph_path(ch, dx, dy, scale):
    g = glyphset[cmap[ord(ch)]]
    pen = SVGPathPen(glyphset)
    g.draw(TransformPen(pen, Transform(scale, 0, 0, -scale, dx, dy)))
    return pen.getCommands()

def glyph_bounds(ch):
    bp = BoundsPen(glyphset)
    glyphset[cmap[ord(ch)]].draw(bp)
    return bp.bounds  # xmin, ymin, xmax, ymax

CAP_PX = 226
scale = CAP_PX / cap
TRACK = 30
m_xmin, _, m_xmax, _ = glyph_bounds("M")
j_xmin, _, j_xmax, _ = glyph_bounds("J")
m_w, j_w = (m_xmax - m_xmin) * scale, (j_xmax - j_xmin) * scale
total = m_w + TRACK + j_w
x0 = CX - total / 2
baseline = CY + CAP_PX / 2
d_m = glyph_path("M", x0 - m_xmin * scale, baseline, scale)
d_j = glyph_path("J", x0 + m_w + TRACK - j_xmin * scale, baseline, scale)

# ---------------------------------------------------------------- seams
# Each seam: circular arc between two points on the ball outline near the
# top/bottom of one side, bulging toward that side's edge.
half_chord = R * math.cos(A_END)                  # vertical half-extent
chord_x_off = R * math.sin(A_END)                 # chord distance from center
d_center = math.sqrt(R_ARC**2 - half_chord**2)    # arc center offset from chord

def seam_geometry(side):
    """side: -1 left, +1 right. Returns (arc path, arc center x, θ range)."""
    xc = CX + side * chord_x_off                  # chord x
    top, bot = (xc, CY - half_chord), (xc, CY + half_chord)
    cx_arc = xc - side * d_center                 # arc center: opposite side
    th_top = math.atan2(top[1] - CY, top[0] - cx_arc)
    th_bot = math.atan2(bot[1] - CY, bot[0] - cx_arc)
    if side < 0:  # left arc spans the ±180° seam; wrap for clean interpolation
        th_top %= 2 * math.pi
        th_bot %= 2 * math.pi
    sweep = 1 if side > 0 else 0
    path = (f"M {top[0]:.1f} {top[1]:.1f} "
            f"A {R_ARC} {R_ARC} 0 0 {sweep} {bot[0]:.1f} {bot[1]:.1f}")
    return path, cx_arc, th_top, th_bot

def stitches(side, n=7, margin=0.13, apex_out=12, end_in=15, half_w=14):
    """Chevron lacing crossing the seam, apex toward the ball's edge."""
    _, cx_arc, th_top, th_bot = seam_geometry(side)
    segs = []
    for i in range(n):
        f = margin + (1 - 2 * margin) * i / (n - 1)
        th = th_top + (th_bot - th_top) * f
        px, py = cx_arc + R_ARC * math.cos(th), CY + R_ARC * math.sin(th)
        rx, ry = math.cos(th), math.sin(th)       # radial: toward ball edge
        tx, ty = -math.sin(th), math.cos(th)      # tangent along seam
        ax, ay = px + rx * apex_out, py + ry * apex_out
        e1 = (px - rx * end_in + tx * half_w, py - ry * end_in + ty * half_w)
        e2 = (px - rx * end_in - tx * half_w, py - ry * end_in - ty * half_w)
        segs.append(f"M {e1[0]:.1f} {e1[1]:.1f} L {ax:.1f} {ay:.1f} "
                    f"L {e2[0]:.1f} {e2[1]:.1f}")
    return " ".join(segs)

seam_l, _, _, _ = seam_geometry(-1)
seam_r, _, _, _ = seam_geometry(+1)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <!-- Scorecard Modern — app icon for matt-jones.org -->
  <rect width="{S}" height="{S}" fill="{PAPER}"/>
  <ellipse cx="{CX}" cy="{CY + R + 36}" rx="230" ry="24" fill="{INK}" opacity="0.06"/>
  <circle cx="{CX}" cy="{CY}" r="{R}" fill="{CARD}" stroke="{STITCH}" stroke-width="{BALL_STROKE}"/>
  <path d="{seam_l}" fill="none" stroke="{STITCH}" stroke-width="{SEAM_W}" stroke-linecap="round"/>
  <path d="{seam_r}" fill="none" stroke="{STITCH}" stroke-width="{SEAM_W}" stroke-linecap="round"/>
  <path d="{stitches(-1)}" fill="none" stroke="{STITCH}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="{stitches(+1)}" fill="none" stroke="{STITCH}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="{d_m}" fill="{INK}"/>
  <path d="{d_j}" fill="{INK}"/>
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

print(f"monogram width {total:.0f}px; seam chords at ±{chord_x_off:.0f}px; "
      f"content radius {R + BALL_STROKE/2:.0f} vs safe {0.4*S:.0f}")
