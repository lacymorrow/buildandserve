/**
 * Rasterises the Build and Serve brand mark into every icon the app serves.
 *
 * Spec: docs/design/brand/README.md. The source geometry is the four SVGs in
 * docs/design/brand/assets/, which make_mark.py generates from the Geist
 * outline. This script only changes ground, fill and framing per surface.
 *
 * Run: bun run scripts/build-brand-assets.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

/** --foreground and --background from src/styles/theme.css, dark theme. */
const INK = "#0a0a0a";
const PAPER = "#fafafa";

const TILE =
  "M0 64A64 64 0 0 1 64 0H448A64 64 0 0 1 512 64V448A64 64 0 0 1 448 512H64A64 64 0 0 1 0 448Z";
const TILE_SMALL =
  "M0 48A48 48 0 0 1 48 0H464A48 48 0 0 1 512 48V464A48 48 0 0 1 464 512H48A48 48 0 0 1 0 464Z";
const GLYPH =
  "M224.2 402.4C259.4 402.4 288.2 394.4 305 382L316.6 396H377L340.2 352.4C357.4 332.8 369 302 370.6 271.2L318.6 266.4C318.6 287.2 314.6 304 307 314.4L255.4 250C297.4 224.4 316.2 203.6 316.2 171.2C316.2 132.8 288.6 105.6 236.6 105.6C185 105.6 156.2 132.8 156.2 175.6C156.2 200.8 166.6 218.4 185 239.6C142.6 267.2 127 290 127 326C127 375.2 161.8 402.4 224.2 402.4ZM229 356.8C196.6 356.8 181 343.2 181 321.6C181 302 190.2 288 213 272.8L271 344.8C263.4 352 249.4 356.8 229 356.8ZM229 218.4C214.2 201.2 209.4 190.4 209.4 177.2C209.4 161.2 219.4 150.8 237 150.8C253.4 150.8 262.6 160 262.6 175.6C262.6 192.4 253 203.6 229 218.4Z";
const GLYPH_SMALL =
  "M220.4 422.8C260.4 422.8 293.2 413.7 312.3 399.6L325.5 415.5H394.2L352.3 365.9C371.9 343.6 385.1 308.6 386.9 273.6L327.8 268.1C327.8 291.8 323.2 310.9 314.6 322.7L255.9 249.4C303.6 220.3 325 196.7 325 159.8C325 116.1 293.6 85.2 234.5 85.2C175.8 85.2 143 116.1 143 164.8C143 193.5 154.9 213.5 175.8 237.6C127.6 269 109.8 294.9 109.8 335.9C109.8 391.9 149.4 422.8 220.4 422.8ZM225.8 370.9C189 370.9 171.2 355.5 171.2 330.9C171.2 308.6 181.7 292.7 207.6 275.4L273.6 357.3C265 365.5 249 370.9 225.8 370.9ZM225.8 213.5C209 193.9 203.5 181.7 203.5 166.6C203.5 148.4 214.9 136.6 234.9 136.6C253.6 136.6 264.1 147.1 264.1 164.8C264.1 183.9 253.1 196.7 225.8 213.5Z";

/**
 * The mark as two solid fills rather than one knocked-out path. A knockout only
 * reads where there is a page behind it; in a raster icon or a browser tab the
 * cut-out glyph would be transparent and vanish against a light ground.
 */
const solidMark = (tile: string, glyph: string, ink: string, paper: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
  `<path fill="${paper}" d="${tile}"/><path fill="${ink}" d="${glyph}"/></svg>`;

/** Rendered bounds of GLYPH inside the 512 viewBox, measured not guessed. */
const GLYPH_BOX = { width: 251, height: 299, x: 127, y: 105 };

/**
 * Full-bleed variant for the surfaces where the OS supplies the corner shape
 * itself: the tile is dropped so it is not rounded twice, and the glyph is
 * placed on its own measured centre rather than the viewBox centre.
 *
 * `heightFraction` is the glyph's height as a share of the canvas. Maskable
 * icons are cropped to a circle inscribed in the canvas, so they sit tighter
 * than the Apple icon, which only loses its corners.
 */
const bleedMark = (heightFraction: number) => {
  const scale = (512 * heightFraction) / GLYPH_BOX.height;
  const x = 256 - scale * (GLYPH_BOX.x + GLYPH_BOX.width / 2);
  const y = 256 - scale * (GLYPH_BOX.y + GLYPH_BOX.height / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<rect width="512" height="512" fill="${PAPER}"/>` +
    `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})">` +
    `<path fill="${INK}" d="${GLYPH}"/></g></svg>`
  );
};

/** Inside the maskable safe zone: scaled glyph diagonal stays under the crop circle. */
const MASKABLE_GLYPH_HEIGHT = 0.5;
/** Matches the tile mark's own glyph-to-ground ratio, 299/512. */
const APPLE_GLYPH_HEIGHT = 0.58;

/** The mark in its clear-space frame on the brand ground, for avatars and JSON-LD. */
const framedMark = () => {
  const scale = 0.75;
  const offset = (512 - 512 * scale) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<rect width="512" height="512" fill="${INK}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})">` +
    `<path fill="${PAPER}" d="${TILE}"/><path fill="${INK}" d="${GLYPH}"/></g></svg>`
  );
};

const png = (svg: string, size: number, to: string) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(to);

const main = async () => {
  const work = mkdtempSync(join(tmpdir(), "brand-"));

  // Tab icon. Served by the Next.js app-dir file convention at /icon.svg.
  writeFileSync("src/app/icon.svg", `${solidMark(TILE, GLYPH, INK, PAPER)}\n`);

  // iOS masks and rounds this itself, so it ships full bleed.
  await png(bleedMark(APPLE_GLYPH_HEIGHT), 180, "src/app/apple-icon.png");

  // Declared purpose "maskable" in src/app/manifest.ts.
  const maskable = bleedMark(MASKABLE_GLYPH_HEIGHT);
  await png(maskable, 192, "public/app/web-app-manifest-192x192.png");
  await png(maskable, 512, "public/app/web-app-manifest-512x512.png");

  // JSON-LD organisation logo and siteConfig.creator.avatar.
  await png(framedMark(), 512, "public/logo.png");

  // favicon.ico carries three sizes; 16px uses the optical small cut.
  const ico: string[] = [];
  for (const [size, svg] of [
    [16, solidMark(TILE_SMALL, GLYPH_SMALL, INK, PAPER)],
    [32, solidMark(TILE, GLYPH, INK, PAPER)],
    [48, solidMark(TILE, GLYPH, INK, PAPER)],
  ] as const) {
    const file = join(work, `favicon-${size}.png`);
    await png(svg, size, file);
    ico.push(file);
  }
  execFileSync("magick", [...ico, "src/app/favicon.ico"]);

  console.log("brand assets written");
};

void main();
