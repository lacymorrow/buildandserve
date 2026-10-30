"""Build the Build and Serve mark as self-contained SVGs from the Geist outline."""
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

d = json.load(open("amp.json"))
x0, y0, x1, y1 = d["bounds"]

S = 0.40                       # glyph scale against the 512 tile (742upm -> ~297px tall)
TILE = 512
RX = 64                        # 12.5%: a softened square, not an app-icon squircle

# Centre the glyph bbox in the tile, then nudge for optical balance: the ampersand's
# tail is visually light, so its bbox centre sits right of and below its mass centre.
OPT_X, OPT_Y = -4.0, -2.0
tx = TILE / 2 - S * (x0 + x1) / 2 + OPT_X
ty = TILE / 2 + S * (y0 + y1) / 2 + OPT_Y

# Bake the transform into the path data so tile and glyph can share one <path>.
font = TTFont("geist-semibold.otf")
gs = font.getGlyphSet()
svg_pen = SVGPathPen(gs)
gs[d["glyph"]].draw(TransformPen(svg_pen, Transform(S, 0, 0, -S, tx, ty)))
glyph = svg_pen.getCommands()

tile = (
    f"M0 {RX}A{RX} {RX} 0 0 1 {RX} 0H{TILE - RX}A{RX} {RX} 0 0 1 {TILE} {RX}"
    f"V{TILE - RX}A{RX} {RX} 0 0 1 {TILE - RX} {TILE}H{RX}A{RX} {RX} 0 0 1 0 {TILE - RX}Z"
)

HEAD = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE} {TILE}" '
    f'width="{TILE}" height="{TILE}" role="img" aria-label="Build and Serve">'
)

# Primary. One path, fill-rule evenodd: the glyph is cut out of the tile, so the mark is a
# single shape in currentColor and the page shows through the counter. Works on any ground.
primary = f'{HEAD}<path fill="currentColor" fill-rule="evenodd" d="{tile}{glyph}"/></svg>'

# Reversed. Glyph only, no tile, for dense UI where the solid block is too loud.
reversed_ = f'{HEAD}<path fill="currentColor" d="{glyph}"/></svg>'

# Favicon. Hard-coded, because a tab strip gives currentColor no meaning and the mark has
# to hold against both a light and a dark Chrome theme.
favicon = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE} {TILE}" width="{TILE}" height="{TILE}">'
    f'<path fill="#fafafa" fill-rule="evenodd" d="{tile}{glyph}"/></svg>'
)

# Small optical size. Below ~24px the knocked-out strokes thin out, so the glyph grows and
# the corner tightens. Standard optical-size practice, not a different mark.
svg_pen_s = SVGPathPen(gs)
S_SM, RX_SM = 0.455, 48
tx_s = TILE / 2 - S_SM * (x0 + x1) / 2 + OPT_X
ty_s = TILE / 2 + S_SM * (y0 + y1) / 2 + OPT_Y
gs[d["glyph"]].draw(TransformPen(svg_pen_s, Transform(S_SM, 0, 0, -S_SM, tx_s, ty_s)))
tile_sm = (
    f"M0 {RX_SM}A{RX_SM} {RX_SM} 0 0 1 {RX_SM} 0H{TILE - RX_SM}A{RX_SM} {RX_SM} 0 0 1 {TILE} {RX_SM}"
    f"V{TILE - RX_SM}A{RX_SM} {RX_SM} 0 0 1 {TILE - RX_SM} {TILE}H{RX_SM}A{RX_SM} {RX_SM} 0 0 1 0 {TILE - RX_SM}Z"
)
favicon_sm = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE} {TILE}" width="{TILE}" height="{TILE}">'
    f'<path fill="#fafafa" fill-rule="evenodd" d="{tile_sm}{svg_pen_s.getCommands()}"/></svg>'
)

for name, body in [("mark.svg", primary), ("mark-reversed.svg", reversed_),
                   ("favicon.svg", favicon), ("favicon-small.svg", favicon_sm)]:
    open(name, "w").write(body)
    print(f"{name:20} {len(body):5} bytes")

print(f"glyph box in tile: x {tx + S * x0:.0f}..{tx + S * x1:.0f}  y {ty - S * y1:.0f}..{ty - S * y0:.0f}")
