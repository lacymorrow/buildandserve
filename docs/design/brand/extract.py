"""Extract the Geist Semibold ampersand as an SVG path, scaled into a 512 tile."""
import base64, json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

src, out_otf = sys.argv[1], sys.argv[2]
with open(src) as f:
    blob = json.load(f)
raw = base64.b64decode(blob["base64Font"])
with open(out_otf, "wb") as f:
    f.write(raw)

font = TTFont(out_otf)
upm = font["head"].unitsPerEm
gs = font.getGlyphSet()
name = font.getBestCmap()[ord("&")]

bp = BoundsPen(gs)
gs[name].draw(bp)
x0, y0, x1, y1 = bp.bounds
pen = SVGPathPen(gs)
gs[name].draw(pen)

print(json.dumps({
    "upm": upm, "glyph": name,
    "bounds": [x0, y0, x1, y1],
    "width": x1 - x0, "height": y1 - y0,
    "path": pen.getCommands(),
}))
