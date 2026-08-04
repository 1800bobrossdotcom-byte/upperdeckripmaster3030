#!/usr/bin/env python3
"""Card type as OUTLINES — no font ships, no font is named.  npm run cardtype

    python3 scripts/build-card-type.py "SCRAM JETS" --out cards/type/scram-jets.json

⛔ THE FONT WAS A DEPLOY DECISION, NOT A STYLE ONE, and the artist settled it: NO FONT.
   `--fat` is 'Arial Black', which does not exist on Linux or Android. On the site that is
   cosmetic drift. On a 1/1 whose `animation_url` renders in a SANDBOXED IFRAME AT AN OPAQUE
   ORIGIN it means the collector's machine decides what the permanent artwork looks like — every
   buyer a slightly different card. Arial is Monotype-licensed and cannot be embedded, so naming
   it and hoping was never an option either.

⚑ SO THE TYPE BECOMES GEOMETRY AT BUILD TIME. Contours in, contours out; the browser gets
   polygons and never asks what is installed. Two consequences, and the second is the better one:

     1 it renders identically everywhere, including with NO FONTS INSTALLED AT ALL
       (acceptance test 8 in docs/HERO-33-BRIEF.md), and
     2 ⚑ THE LETTERFORMS CAN BE GLITCHED. A displaced plate, a mis-registered separation and a
       torn edge are all things you do to SHAPES. A CSS font cannot be pulled apart; an outline
       can. The glitch wants the type to be a mesh, so this is the art answer as well as the
       deploy one.

⚠ LIBERATION SANS IS THE OUTLINE SOURCE, AND THE LICENCE IS THE REASON. It is metric-compatible
  with Arial — same widths, same fit, the look the artist asked for — and it is OFL, which permits
  derivative works. Tracing Arial itself at build time would still be deriving from a licensed
  face. Nothing from this font is redistributed: what is committed is coordinates.

⚠ THE OUTPUT IS COMMITTED, not generated at page load. A hero must be reachable cold in a sandbox
  with no build step and no network beyond its own origin.
"""
import argparse, json, os, re, sys, unicodedata

try:
    from fontTools.ttLib import TTFont
    from fontTools.pens.recordingPen import DecomposingRecordingPen
except ImportError:
    sys.exit("fontTools is required:  pip install fonttools")

# Liberation Sans Bold: Arial Black is not metric-matched by anything free, and Bold is the closest
# honest stand-in for the weight the artist means. Swap the path here if a licensed face is ever
# vendored — nothing downstream knows which file this came from.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/LiberationSans-Bold.ttf",
]


def find_font(explicit=None):
    if explicit:
        if not os.path.exists(explicit):
            sys.exit(f"no such font: {explicit}")
        return explicit
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    sys.exit("Liberation Sans Bold not found — pass --font")


def quad_points(p0, p1, p2, steps):
    """Flatten one quadratic bezier. TrueType is all quadratics."""
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        out.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return out


def cubic_points(p0, p1, p2, p3, steps):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return out


def glyph_contours(font, glyphset, name, steps):
    """One glyph -> list of closed contours, in font units.

    ⚠ DecomposingRecordingPen, not RecordingPen: composite glyphs (accents, and in some faces
    plain letters) are references to other glyphs, and a plain recording pen hands back the
    reference rather than the outline. The symptom is a letter that silently comes out EMPTY —
    which in a card generator reads as a spacing bug, not a missing glyph.
    """
    pen = DecomposingRecordingPen(glyphset)
    glyphset[name].draw(pen)
    contours, cur, start = [], [], None
    for op, args in pen.value:
        if op == "moveTo":
            if len(cur) > 2:
                contours.append(cur)
            start = args[0]
            cur = [tuple(start)]
        elif op == "lineTo":
            cur.append(tuple(args[0]))
        elif op == "qCurveTo":
            # (control..., end) — implied on-curve midpoints between consecutive controls
            pts = [tuple(a) for a in args if a is not None]
            if not pts:
                continue
            prev = cur[-1]
            ctrls, end = pts[:-1], pts[-1]
            for i, c in enumerate(ctrls):
                nxt = ctrls[i + 1] if i + 1 < len(ctrls) else end
                mid = end if i + 1 >= len(ctrls) else ((c[0] + nxt[0]) / 2, (c[1] + nxt[1]) / 2)
                cur.extend(quad_points(prev, c, mid, steps))
                prev = mid
        elif op == "curveTo":
            pts = [tuple(a) for a in args]
            prev = cur[-1]
            if len(pts) == 3:
                cur.extend(cubic_points(prev, pts[0], pts[1], pts[2], steps))
            else:
                cur.extend([p for p in pts])
        elif op == "closePath":
            if len(cur) > 2:
                contours.append(cur)
            cur = []
    if len(cur) > 2:
        contours.append(cur)
    return contours


def build(text, font_path, steps=8, tracking=0.0):
    font = TTFont(font_path)
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()
    upem = font["head"].unitsPerEm
    hmtx = font["hmtx"]

    letters, pen_x = [], 0.0
    for ch in text:
        if ch == " ":
            pen_x += hmtx[cmap[ord(" ")]][0] if ord(" ") in cmap else upem * 0.28
            continue
        cp = ord(ch)
        if cp not in cmap:
            # ⚠ Loudly. A silently dropped glyph is a name that ships wrong on a 1/1.
            sys.exit(f"glyph missing from the font: {ch!r} (U+{cp:04X})")
        gname = cmap[cp]
        adv = hmtx[gname][0]
        cons = glyph_contours(font, glyphset, gname, steps)
        # normalise to em units with the pen offset baked in, y UP, origin at the baseline
        norm = [[[(x + pen_x) / upem, y / upem] for (x, y) in c] for c in cons]
        letters.append({"ch": ch, "adv": adv / upem, "x": pen_x / upem, "contours": norm})
        pen_x += adv + tracking * upem

    xs = [p[0] for L in letters for c in L["contours"] for p in c]
    ys = [p[1] for L in letters for c in L["contours"] for p in c]
    return {
        "v": 1,
        "text": text,
        "note": ("Outlines only — NO FONT SHIPS AND NO FONT IS NAMED. Built by "
                 "scripts/build-card-type.py from a metric-compatible OFL face; what is stored "
                 "here is coordinates, not type software. See docs/HERO-33-BRIEF.md §0."),
        "units": "em (y up, origin on the baseline)",
        "advance": pen_x / upem,
        "bbox": [min(xs), min(ys), max(xs), max(ys)] if xs else [0, 0, 0, 0],
        "letters": letters,
    }


def to_svg(spec, px=1200):
    """A look at it. ⚠ THE POINT OF THIS IS THAT IT IS NOT A RENDER OF A FONT — if the SVG and the
    card ever disagree, the coordinates are the truth and the SVG is the bug."""
    x0, y0, x1, y1 = spec["bbox"]
    w, h = (x1 - x0) or 1, (y1 - y0) or 1
    sc = px / w
    paths = []
    for L in spec["letters"]:
        d = []
        for c in L["contours"]:
            d.append("M" + " L".join(f"{(x-x0)*sc:.2f},{(y1-y)*sc:.2f}" for x, y in c) + " Z")
        paths.append(f'<path d="{" ".join(d)}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{h*sc:.0f}" '
            f'viewBox="0 0 {px} {h*sc:.0f}"><g fill="#f4ead8">' + "".join(paths) + "</g></svg>")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text")
    ap.add_argument("--out", help="write the JSON here")
    ap.add_argument("--svg", help="also write an SVG proof here")
    ap.add_argument("--font", help="override the outline source")
    ap.add_argument("--steps", type=int, default=8, help="bezier flattening steps per segment")
    ap.add_argument("--tracking", type=float, default=0.0, help="extra letterspacing, em")
    a = ap.parse_args()

    spec = build(a.text.upper(), find_font(a.font), a.steps, a.tracking)
    pts = sum(len(c) for L in spec["letters"] for c in L["contours"])
    cons = sum(len(L["contours"]) for L in spec["letters"])
    if a.out:
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        with open(a.out, "w") as f:
            json.dump(spec, f, separators=(",", ":"))
        print(f"  ok   {a.out}")
    if a.svg:
        os.makedirs(os.path.dirname(a.svg) or ".", exist_ok=True)
        with open(a.svg, "w") as f:
            f.write(to_svg(spec))
        print(f"  ok   {a.svg}")
    print(f"       {spec['text']!r}  ->  {len(spec['letters'])} letters · {cons} contours · "
          f"{pts} points · advance {spec['advance']:.3f} em")
    if not a.out and not a.svg:
        json.dump(spec, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
