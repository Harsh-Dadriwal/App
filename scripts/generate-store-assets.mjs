// Google Play store-listing graphics: 512px icon, 1024x500 feature graphic and four
// 1080x1920 phone screenshots (designed from the app's real screens). Writes to play-store/.
// Run: node scripts/generate-store-assets.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "play-store");
mkdirSync(join(OUT, "screenshots"), { recursive: true });

const C = {
  night: "#1f1712",
  night2: "#33261d",
  gold: "#e0a33a",
  brand: "#c2570c",
  brandSoft: "#fff1e2",
  bg: "#f6f1ea",
  ink: "#1c1611",
  muted: "#7a6e60",
  line: "#ece3d6",
  teal: "#0f766e",
  tealSoft: "#e6f4f1",
  green: "#0f9f6e",
  greenSoft: "#e5f6ef",
  red: "#dc2626",
  redSoft: "#fdecec"
};
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function categoryImage(name, size) {
  const png = await sharp(readFileSync(join(ROOT, "public", "categories", `${name}.webp`))).resize(size, Math.round(size * 0.75)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const bolt = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.gold}"/>
  <path transform="translate(${cx - r * 0.42} ${cy - r * 0.62}) scale(${r / 50})" d="M24 0 L4 36 L20 36 L12 62 L40 22 L24 22 L32 0 Z" fill="${C.night}"/>`;

const text = (x, y, value, size, { weight = 700, fill = C.ink, anchor = "start", opacity = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${esc(value)}</text>`;

// Pass a negative x to right-align the pill so it ends at -x.
const pill = (x, y, label, fg, bg, size = 26) => {
  const width = label.length * size * 0.56 + size * 1.4;
  if (x < 0) x = -x - width;
  return `<rect x="${x}" y="${y}" width="${width}" height="${size * 1.7}" rx="${size * 0.85}" fill="${bg}"/>${text(x + size * 0.7, y + size * 1.18, label, size, { weight: 800, fill: fg })}`;
};

// A phone-sized canvas: headline on the brand background, then the app screen in a rounded frame.
function screenshot(headline, subline, appTitle, appSubtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.night}"/><stop offset="1" stop-color="#4a2a12"/></linearGradient>
  <filter id="sh"><feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000" flood-opacity="0.45"/></filter>
  <clipPath id="screen"><rect x="90" y="380" width="900" height="1640" rx="64"/></clipPath></defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <circle cx="980" cy="120" r="240" fill="${C.gold}" opacity="0.08"/>
  ${text(540, 165, headline, 72, { weight: 800, fill: "#fff", anchor: "middle" })}
  ${text(540, 245, subline, 38, { weight: 500, fill: "#e9d9c4", anchor: "middle" })}
  <g filter="url(#sh)"><rect x="90" y="380" width="900" height="1640" rx="64" fill="${C.bg}"/></g>
  <g clip-path="url(#screen)">
    <rect x="90" y="380" width="900" height="270" fill="${C.night}"/>
    ${bolt(160, 455, 30)}
    ${text(210, 448, "Mahalaxmi Electricals", 30, { weight: 800, fill: "#f6ede2" })}
    ${text(210, 486, "Electrical supplies & services", 24, { weight: 500, fill: "#c9b8a6" })}
    ${text(130, 580, appTitle, 56, { weight: 900, fill: "#fff" })}
    ${text(130, 625, appSubtitle, 27, { weight: 500, fill: "#c9b8a6" })}
    ${body}
  </g>
</svg>`;
}

const card = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="#fff" stroke="${C.line}" stroke-width="2"/>`;

async function main() {
  // 1. App icon, 512 x 512 PNG with alpha (Play requirement).
  await sharp(join(ROOT, "mobile", "assets", "icon.png")).resize(512, 512).ensureAlpha().png().toFile(join(OUT, "icon-512.png"));

  // 2. Feature graphic, 1024 x 500.
  const tiles = ["lighting", "fans", "switches", "wires"];
  const tileImages = await Promise.all(tiles.map((name) => categoryImage(name, 220)));
  const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.night}"/><stop offset="1" stop-color="#5a3214"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#g)"/>
    <circle cx="900" cy="60" r="200" fill="${C.gold}" opacity="0.08"/>
    ${bolt(110, 150, 52)}
    ${text(60, 270, "Mahalaxmi", 64, { weight: 900, fill: "#fff" })}
    ${text(60, 336, "Electricals", 64, { weight: 900, fill: C.gold })}
    ${text(60, 392, "Live stock · Quick quotations", 28, { weight: 600, fill: "#f6ede2" })}
    ${text(60, 430, "Trusted electricians & architects", 28, { weight: 600, fill: "#f6ede2" })}
    ${tileImages
      .map((href, index) => {
        const x = 560 + (index % 2) * 220;
        const y = 50 + Math.floor(index / 2) * 210;
        return `<g><rect x="${x - 6}" y="${y - 6}" width="212" height="172" rx="22" fill="#fff" opacity="0.12"/><image href="${href}" x="${x}" y="${y}" width="200" height="150" clip-path="inset(0 round 18px)"/></g>`;
      })
      .join("")}
  </svg>`;
  await sharp(Buffer.from(feature)).png().toFile(join(OUT, "feature-graphic.png"));

  // 3. Screenshots.
  const shopCategories = ["lighting", "fans", "switches", "wires", "mcb", "heaters"];
  const shopNames = ["Lighting", "Fans", "Switches & Sockets", "Wires & Cables", "MCB & Distribution", "Water Heaters"];
  const shopImages = await Promise.all(shopCategories.map((name) => categoryImage(name, 400)));
  const shopBody =
    `<rect x="130" y="690" width="820" height="88" rx="44" fill="#fff" stroke="${C.line}" stroke-width="2"/>${text(190, 746, "Search products or brands…", 30, { weight: 500, fill: C.muted })}` +
    shopImages
      .map((href, index) => {
        const x = 130 + (index % 2) * 420;
        const y = 820 + Math.floor(index / 2) * 400;
        return `${card(x, y, 400, 380)}<image href="${href}" x="${x}" y="${y}" width="400" height="300" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 30px 30px 0 0)"/>${text(x + 26, y + 350, shopNames[index], 30, { weight: 800 })}`;
      })
      .join("");
  await sharp(Buffer.from(screenshot("Shop with live stock", "See what's in stock, order in a tap", "Shop products", "Live stock from our store", shopBody))).png().toFile(join(OUT, "screenshots", "1-shop.png"));

  const listPhoto = await categoryImage("switches", 200);
  const quoteBody = `${card(130, 690, 820, 1000)}
    ${text(170, 760, "QT-1024", 40, { weight: 900 })}${pill(-910, 722, "Quotation ready", C.teal, C.tealSoft)}
    ${text(170, 805, "Photo of your list", 26, { weight: 500, fill: C.muted })}
    <image href="${listPhoto}" x="170" y="830" width="180" height="135" clip-path="inset(0 round 16px)"/>
    ${[
      ["1.5 sq mm Copper Wire (90 m)", "× 4", "@ ₹1,450"],
      ["6A One Way Switch", "× 24", "@ ₹38"],
      ["16A Socket with Switch", "× 8", "@ ₹145"],
      ["12W LED Panel", "× 10", "@ ₹380"]
    ]
      .map(([name, qty, rate], index) => `${text(170, 1040 + index * 78, name, 30, { weight: 600 })}${text(910, 1040 + index * 78, `${qty} ${rate}`, 28, { weight: 800, anchor: "end" })}<line x1="170" y1="${1062 + index * 78}" x2="910" y2="${1062 + index * 78}" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 6"/>`)
      .join("")}
    ${text(910, 1390, "Subtotal ₹11,672", 30, { weight: 500, fill: C.muted, anchor: "end" })}
    ${text(910, 1435, "Discount − ₹172", 30, { weight: 500, fill: C.muted, anchor: "end" })}
    ${text(910, 1500, "Total ₹11,500", 46, { weight: 900, anchor: "end" })}
    <rect x="170" y="1560" width="740" height="96" rx="48" fill="${C.brand}"/>${text(540, 1621, "Accept & order", 34, { weight: 800, fill: "#fff", anchor: "middle" })}`;
  await sharp(Buffer.from(screenshot("Get a quotation fast", "Send a photo of your list — get prices", "Quotations", "Send your list, get prices from the shop", quoteBody))).png().toFile(join(OUT, "screenshots", "2-quotation.png"));

  const steps = ["Received", "Confirmed", "Packed", "Delivered"];
  const orderCard = (y, number, status, statusFg, statusBg, reached, lines) => `${card(130, y, 820, 470)}
    ${text(170, y + 75, number, 40, { weight: 900 })}${pill(-910, y + 36, status, statusFg, statusBg)}
    ${steps.map((step, index) => `<rect x="${170 + index * 186}" y="${y + 120}" width="176" height="10" rx="5" fill="${index <= reached ? C.teal : C.line}"/>${text(170 + index * 186, y + 165, step, 22, { weight: index <= reached ? 800 : 500, fill: index <= reached ? C.ink : C.muted })}`).join("")}
    ${lines.map(([name, qty], index) => `${text(170, y + 240 + index * 62, name, 29, { weight: 600 })}${text(910, y + 240 + index * 62, qty, 29, { weight: 800, anchor: "end" })}`).join("")}`;
  const ordersBody =
    orderCard(700, "ORD-1042", "Packed & ready", C.teal, C.tealSoft, 2, [["Ceiling Fan 1200 mm", "× 3"], ["6A Modular Switch", "× 18"], ["Fan Regulator", "× 3"]]) +
    orderCard(1210, "ORD-1031", "Delivered", C.green, C.greenSoft, 3, [["4 sq mm Copper Wire", "× 2"], ["32A MCB Double Pole", "× 1"], ["8-way Distribution Box", "× 1"]]);
  await sharp(Buffer.from(screenshot("Track every order", "A notification at every step", "My orders", "Track what you ordered", ordersBody))).png().toFile(join(OUT, "screenshots", "3-orders.png"));

  const proBody = `${card(130, 690, 820, 560)}
    ${text(170, 760, "Sharma house – switches", 38, { weight: 900 })}${pill(170, 785, "In their app", C.teal, C.tealSoft, 24)}
    ${text(170, 885, "For Ravi · Selected by you", 27, { weight: 500, fill: C.muted })}
    ${[["6A Modular Switch, white", "× 24"], ["16A Socket", "× 6"], ["Bell Push", "× 1"], ["8M Plate, white", "× 6"]]
      .map(([name, qty], index) => `${text(170, 960 + index * 62, name, 29, { weight: 600 })}${text(910, 960 + index * 62, qty, 29, { weight: 800, anchor: "end" })}`)
      .join("")}
    <rect x="170" y="1180" width="360" height="40" rx="20" fill="#e7f8ee"/>${text(190, 1209, "Share on WhatsApp", 24, { weight: 800, fill: "#128c4a" })}
    ${card(130, 1290, 820, 360)}
    ${text(170, 1360, "Partner incentives", 38, { weight: 900 })}
    ${text(170, 1405, "Electrician · Bronze tier", 27, { weight: 500, fill: C.muted })}
    <rect x="170" y="1440" width="740" height="16" rx="8" fill="${C.line}"/><rect x="170" y="1440" width="300" height="16" rx="8" fill="${C.brand}"/>
    <rect x="170" y="1490" width="740" height="120" rx="24" fill="${C.greenSoft}"/>
    ${text(200, 1540, "You earned ₹250 incentive", 34, { weight: 900, fill: "#0b7a55" })}
    ${text(200, 1585, "For delivered order ORD-1042", 26, { weight: 500, fill: "#0b7a55" })}`;
  await sharp(Buffer.from(screenshot("Electricians & architects", "Pick products for customers, earn incentives", "Product selections", "Pick products for a customer's job", proBody))).png().toFile(join(OUT, "screenshots", "4-professionals.png"));

  console.log("Wrote play-store/icon-512.png, feature-graphic.png and screenshots/1-4");
}

await main();
