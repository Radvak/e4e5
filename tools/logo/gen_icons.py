#!/usr/bin/env python3
"""Generate the e4e5 logo (SVG + every PNG size) from one drawing.

A 4x4 board (files c-f, ranks 3-6) with two arrows on the e-file meeting in
the center: e3->e4 for White, e6->e5 for Black.

Usage: python3 tools/logo/gen_icons.py   (needs rsvg-convert: brew install librsvg)
"""
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
ICONS = ROOT / "apps/web/public/icons"
RES = ROOT / "apps/web/android/app/src/main/res"

FRAME = "#1F4F3A"
LIGHT = "#E9E3D0"
DARK = "#3F7A5C"
ARROW = "#0E2A1F"


def board(scale=1.0, rx=20):
    """Board + arrows, centered in a 512 box, scaled around the center."""
    o, s = 80, 88
    sq = "".join(
        f'<rect x="{o + c * s}" y="{o + r * s}" width="{s}" height="{s}" '
        f'fill="{LIGHT if (r + c) % 2 == 0 else DARK}"/>'
        for r in range(4)
        for c in range(4)
    )
    x, mid = o + 2 * s + s / 2, o + 2 * s
    sw, hw, hl, gap = 9, 27, 38, 10  # shaft/head half-widths, head length, half gap
    ball = 20  # radius of the ball the arrows start from

    def arrow(y0, tip, d):
        b = tip - d * hl
        return (
            f'<path d="M{x - sw} {y0} L{x - sw} {b} L{x - hw} {b} L{x} {tip} '
            f'L{x + hw} {b} L{x + sw} {b} L{x + sw} {y0} Z" fill="{ARROW}" '
            f'stroke="{ARROW}" stroke-width="3" stroke-linejoin="round"/>'
            f'<circle cx="{x}" cy="{y0}" r="{ball}" fill="{ARROW}"/>'
        )

    t = f"translate({256 * (1 - scale)} {256 * (1 - scale)}) scale({scale})"
    return (
        f'<clipPath id="b"><rect x="{o}" y="{o}" width="{4 * s}" height="{4 * s}" rx="{rx}"/></clipPath>'
        f'<g transform="{t}"><g clip-path="url(#b)">{sq}</g>'
        f"{arrow(o + 3 * s + s / 2, mid + gap, -1)}{arrow(o + s / 2, mid - gap, 1)}</g>"
    )


# Scale at which the board fills the whole 512 canvas (no frame).
FULL = 512 / 352


def svg(bg="rounded", scale=FULL, rx=20):
    """The icon cut to a shape (FRAME behind the board), or the board alone ("none")."""
    shape = {
        "rounded": '<rect width="512" height="512" rx="116"/>',
        "square": '<rect width="512" height="512"/>',
        "disc": '<circle cx="256" cy="256" r="256"/>',
        "none": None,
    }[bg]
    head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    if shape is None:
        return f"{head}{board(scale, rx)}</svg>\n"
    return (
        f'{head}<clipPath id="shape">{shape}</clipPath><g clip-path="url(#shape)">'
        f'<rect width="512" height="512" fill="{FRAME}"/>{board(scale, rx)}</g></svg>\n'
    )


def png(content, out, size):
    with tempfile.NamedTemporaryFile("w", suffix=".svg") as f:
        f.write(content)
        f.flush()
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), f.name, "-o", str(out)], check=True)


def main():
    (ICONS / "icon.svg").write_text(svg())
    png(svg(), ICONS / "icon-192.png", 192)
    png(svg(), ICONS / "icon-512.png", 512)
    # iOS rounds the corners itself: full-bleed square, square board corners.
    png(svg("square", rx=0), ICONS / "apple-touch-icon.png", 180)
    # Maskable: the launcher crops to roughly the 80% safe circle; the board
    # fills that area and the arrows stay inside it (like the Android adaptive icon).
    png(svg("square", FULL * 0.8), ICONS / "icon-maskable-512.png", 512)

    # Android launcher (legacy, round, adaptive foreground on a FRAME background).
    for d, n in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        png(svg(), RES / f"mipmap-{d}/ic_launcher.png", n)
        # Round (Android 7 and older): rounded board inside a thin FRAME ring.
        png(svg("disc", 1.18, rx=80), RES / f"mipmap-{d}/ic_launcher_round.png", n)
        # Adaptive (Android 8+): 108dp canvas, about 72dp visible after masking.
        # The board fills the visible area (corners cropped by the mask, like
        # the round icon); the arrows stay inside the 66dp safe circle.
        png(svg("none", FULL * 72 / 108), RES / f"mipmap-{d}/ic_launcher_foreground.png", n * 9 // 4)
    (RES / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{FRAME}</color>\n</resources>\n'
    )


if __name__ == "__main__":
    main()
