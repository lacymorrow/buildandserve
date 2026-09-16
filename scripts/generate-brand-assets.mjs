import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BRAND = join(ROOT, "public", "brand");
const APP = join(ROOT, "public", "app");
const PUBLIC = join(ROOT, "public");

mkdirSync(BRAND, { recursive: true });

const markSvg = readFileSync(join(BRAND, "mark.svg"));
const markWhiteSvg = readFileSync(join(BRAND, "mark-white.svg"));

async function iconOnBackground(svgBuffer, size, bg, markRatio = 0.6) {
  const markSize = Math.round(size * markRatio);
  const mark = await sharp(svgBuffer).resize(markSize, markSize).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
}

function socialSvg(w, h, opts = {}) {
  const { showTagline = true, showUrl = true } = opts;
  const markH = Math.round(Math.min(w, h) * 0.35);
  const markScale = markH / 512;
  const markW = markH * 0.75;
  const mx = Math.round((w - markW) / 2);
  const my = Math.round(h * 0.08);
  const titleY = Math.round(my + markH + h * 0.1);
  const titleSize = Math.round(w * 0.046);
  const tagY = titleY + Math.round(titleSize * 1.6);
  const tagSize = Math.round(w * 0.019);
  const urlY = Math.round(h * 0.92);
  const urlSize = Math.round(w * 0.016);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#0f172a"/>
  <g transform="translate(${mx}, ${my}) scale(${markScale})">
    <path d="M64 64 L304 256 L64 448 Z" fill="#ffffff"/>
    <path d="M208 64 L448 256 L208 448 Z" fill="#ffffff" opacity="0.6"/>
  </g>
  <text x="${w / 2}" y="${titleY}" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${titleSize}" font-weight="700" fill="#ffffff"
        letter-spacing="0.06em">BUILD AND SERVE</text>
  ${
    showTagline
      ? `<text x="${w / 2}" y="${tagY}" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${tagSize}" fill="#94a3b8"
        letter-spacing="0.01em">Modern sites and applications with an emphasis on AI features.</text>`
      : ""
  }
  ${
    showUrl
      ? `<text x="${w / 2}" y="${urlY}" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${urlSize}" fill="#64748b">buildandserve.com</text>`
      : ""
  }
</svg>`;
}

const white = { r: 255, g: 255, b: 255, alpha: 1 };

async function run() {
  // --- App icons (colored mark on white bg) ---
  const icon192 = await iconOnBackground(markSvg, 192, white);
  writeFileSync(join(APP, "web-app-manifest-192x192.png"), icon192);
  console.log("  web-app-manifest-192x192.png");

  const icon512 = await iconOnBackground(markSvg, 512, white);
  writeFileSync(join(APP, "web-app-manifest-512x512.png"), icon512);
  console.log("  web-app-manifest-512x512.png");

  // --- Apple touch icon ---
  const apple = await iconOnBackground(markSvg, 180, white);
  writeFileSync(join(PUBLIC, "apple-touch-icon.png"), apple);
  console.log("  apple-touch-icon.png");

  // --- OG logo (white mark, transparent bg, for dark OG images) ---
  await sharp(markWhiteSvg).resize(200, 200).png().toFile(join(APP, "og-logo.png"));
  console.log("  og-logo.png");

  // --- Main logo.png (colored mark, transparent bg) ---
  await sharp(markSvg).resize(1024, 1024).png().toFile(join(PUBLIC, "logo.png"));
  console.log("  logo.png");

  // --- Static OG image fallback (1200x630) ---
  const ogSvg = Buffer.from(socialSvg(1200, 630));
  await sharp(ogSvg).png().toFile(join(APP, "og-image.png"));
  console.log("  og-image.png");

  // --- Social media images ---
  const cardSvg = Buffer.from(socialSvg(1200, 630));
  await sharp(cardSvg).png().toFile(join(BRAND, "social-card-1200x630.png"));
  console.log("  social-card-1200x630.png");

  const bannerSvg = Buffer.from(socialSvg(1500, 500, { showTagline: false }));
  await sharp(bannerSvg).png().toFile(join(BRAND, "social-banner-1500x500.png"));
  console.log("  social-banner-1500x500.png");

  const squareSvg = Buffer.from(socialSvg(1080, 1080));
  await sharp(squareSvg).png().toFile(join(BRAND, "social-square-1080x1080.png"));
  console.log("  social-square-1080x1080.png");

  const linkedinSvg = Buffer.from(socialSvg(1584, 396, { showTagline: false }));
  await sharp(linkedinSvg).png().toFile(join(BRAND, "social-linkedin-1584x396.png"));
  console.log("  social-linkedin-1584x396.png");

  const fbSvg = Buffer.from(socialSvg(820, 312, { showTagline: false, showUrl: false }));
  await sharp(fbSvg).png().toFile(join(BRAND, "social-facebook-820x312.png"));
  console.log("  social-facebook-820x312.png");

  // --- Favicon ICO (32x32 PNG as .ico isn't natively supported, but we have SVG) ---
  await sharp(markSvg).resize(32, 32).png().toFile(join(PUBLIC, "favicon-32x32.png"));
  console.log("  favicon-32x32.png");

  await sharp(markSvg).resize(16, 16).png().toFile(join(PUBLIC, "favicon-16x16.png"));
  console.log("  favicon-16x16.png");

  console.log("\nAll brand assets generated.");
}

run().catch(console.error);
