// The app icon: a bold white "M" (Mahalaxmi) with a lightning badge on an amber-orange
// gradient. Writes every icon file the apps use. Run: node scripts/generate-app-icon.mjs
// Afterwards run scripts/generate-store-assets.mjs to refresh the Play Store graphics.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "mobile", "assets");

const BACKGROUND = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/><circle cx="820" cy="190" r="260" fill="#fff" opacity="0.08"/>`;

// Kept inside the centre circle Android never crops (66% of the canvas).
const FOREGROUND = `<path d="M300 760 L300 420 L380 420 L512 590 L644 420 L724 420 L724 760 L640 760 L640 555 L540 685 L484 685 L384 555 L384 760 Z" fill="#fff"/>
  <circle cx="512" cy="300" r="92" fill="#1f1712"/>
  <path transform="translate(474 230) scale(0.95)" d="M58 0 L14 86 L46 86 L30 150 L86 54 L54 54 L74 0 Z" fill="#fbbf24"/>`;

const svg = (inner, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${inner}</svg>`;
const rounded = (inner) => svg(`<defs><clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath></defs><g clip-path="url(#r)">${inner}</g>`);

// Store/launcher icon (full square; the system applies its own mask).
await sharp(Buffer.from(svg(BACKGROUND + FOREGROUND))).png().toFile(join(ASSETS, "icon.png"));
// Android adaptive icon: separate layers so the launcher can mask and animate them.
await sharp(Buffer.from(svg(FOREGROUND))).png().toFile(join(ASSETS, "adaptive-icon.png"));
await sharp(Buffer.from(svg(BACKGROUND))).png().toFile(join(ASSETS, "adaptive-icon-background.png"));
// Loading screen: the rounded icon on the dark splash background.
await sharp(Buffer.from(rounded(BACKGROUND + FOREGROUND))).png().toFile(join(ASSETS, "splash-icon.png"));
// Website tab icon.
writeFileSync(join(ROOT, "app", "icon.svg"), rounded(BACKGROUND + FOREGROUND).replace('width="1024" height="1024"', 'width="64" height="64"') + "\n");

console.log("Wrote mobile/assets/icon.png, adaptive-icon.png, adaptive-icon-background.png, splash-icon.png and app/icon.svg");
