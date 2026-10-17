// Draws the default shop category pictures (original flat illustrations) and saves them
// as WebP images in public/categories, which the web app serves. Run: node scripts/generate-category-images.mjs
// Admins can replace any of them from Price List & Stock -> Category pictures.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "categories");

function frame(from, to, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000000" flood-opacity="0.3"/></filter>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="400" cy="300" r="280" fill="url(#glow)"/>
  <circle cx="700" cy="70" r="130" fill="#ffffff" opacity="0.07"/>
  <circle cx="80" cy="560" r="170" fill="#000000" opacity="0.09"/>
  <circle cx="120" cy="90" r="10" fill="#ffffff" opacity="0.25"/>
  <circle cx="690" cy="520" r="14" fill="#ffffff" opacity="0.18"/>
  <g filter="url(#sh)">${art}</g>
</svg>`;
}

const rays = (cx, cy, r1, r2, color, count = 10) =>
  Array.from({ length: count }, (_, i) => {
    const a = (Math.PI * 2 * i) / count;
    return `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cy + r2 * Math.sin(a)}" stroke="${color}" stroke-width="10" stroke-linecap="round" opacity="0.75"/>`;
  }).join("");

const CATEGORIES = {
  lighting: frame("#312e81", "#1e1b4b", `
    <line x1="400" y1="0" x2="400" y2="160" stroke="#e5e7eb" stroke-width="7"/>
    <circle cx="400" cy="330" r="200" fill="#fde68a" opacity="0.18"/>
    ${rays(400, 330, 150, 190, "#fde68a", 12)}
    <rect x="365" y="150" width="70" height="60" rx="10" fill="#cbd5e1"/>
    <rect x="365" y="168" width="70" height="7" fill="#94a3b8"/><rect x="365" y="186" width="70" height="7" fill="#94a3b8"/>
    <path d="M360 210 L440 210 L452 238 C 530 268 530 400 400 440 C 270 400 270 268 348 238 Z" fill="#fef3c7"/>
    <circle cx="400" cy="340" r="95" fill="#fde68a"/>
    <path d="M372 372 L384 300 L400 336 L416 300 L428 372" fill="none" stroke="#f59e0b" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
    <ellipse cx="365" cy="300" rx="16" ry="34" fill="#ffffff" opacity="0.55" transform="rotate(25 365 300)"/>`),

  fans: frame("#0f766e", "#134e4a", `
    <circle cx="400" cy="300" r="235" fill="none" stroke="#ccfbf1" stroke-width="5" stroke-dasharray="26 22" opacity="0.4"/>
    ${[0, 120, 240].map((deg) => `<ellipse cx="400" cy="165" rx="58" ry="132" fill="#f0fdfa" transform="rotate(${deg} 400 300)"/>
    <ellipse cx="388" cy="150" rx="18" ry="80" fill="#99f6e4" opacity="0.45" transform="rotate(${deg} 400 300)"/>`).join("")}
    <circle cx="400" cy="300" r="68" fill="#fbbf24"/>
    <circle cx="400" cy="300" r="40" fill="#f59e0b"/>
    <circle cx="400" cy="300" r="14" fill="#fef3c7"/>`),

  switches: frame("#b45309", "#7c2d12", `
    <rect x="170" y="140" width="460" height="320" rx="40" fill="#fffbeb"/>
    <rect x="186" y="156" width="428" height="288" rx="30" fill="none" stroke="#fde68a" stroke-width="4"/>
    ${[215, 330].map((x) => `<rect x="${x}" y="200" width="92" height="200" rx="18" fill="#f5f5f4" stroke="#e7e5e4" stroke-width="4"/>
    <rect x="${x + 10}" y="210" width="72" height="88" rx="12" fill="#e7e5e4"/>
    <circle cx="${x + 46}" cy="370" r="9" fill="#ef4444"/>`).join("")}
    <circle cx="525" cy="300" r="78" fill="#f5f5f4" stroke="#e7e5e4" stroke-width="4"/>
    <circle cx="525" cy="262" r="15" fill="#44403c"/>
    <circle cx="497" cy="322" r="12" fill="#44403c"/>
    <circle cx="553" cy="322" r="12" fill="#44403c"/>`),

  wires: frame("#1e3a8a", "#172554", `
    ${Array.from({ length: 8 }, (_, i) => `<ellipse cx="350" cy="${300 + i * 3}" rx="${200 - i * 12}" ry="${130 - i * 8}" fill="none" stroke="${i % 2 ? "#facc15" : "#fde047"}" stroke-width="15"/>`).join("")}
    <ellipse cx="350" cy="318" rx="98" ry="62" fill="#1e3a8a"/>
    ${[
      ["#ef4444", "M520 290 C 600 270 620 200 700 190"],
      ["#facc15", "M530 320 C 610 320 640 300 715 300"],
      ["#22c55e", "M520 350 C 600 370 620 420 700 420"]
    ]
      .map(([color, d]) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round"/>`)
      .join("")}
    <circle cx="708" cy="189" r="9" fill="#f59e0b"/><circle cx="724" cy="300" r="9" fill="#f59e0b"/><circle cx="708" cy="421" r="9" fill="#f59e0b"/>`),

  mcb: frame("#334155", "#0f172a", `
    <rect x="160" y="120" width="480" height="360" rx="28" fill="#e2e8f0"/>
    <rect x="160" y="120" width="480" height="60" rx="28" fill="#cbd5e1"/>
    <rect x="190" y="215" width="420" height="200" rx="12" fill="#cbd5e1"/>
    ${Array.from({ length: 5 }, (_, i) => {
      const x = 205 + i * 80;
      return `<rect x="${x}" y="225" width="68" height="180" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="3"/>
      <rect x="${x + 20}" y="268" width="28" height="56" rx="6" fill="${i === 0 ? "#ef4444" : "#1e293b"}"/>
      <rect x="${x + 14}" y="350" width="40" height="8" rx="4" fill="#94a3b8"/><rect x="${x + 14}" y="366" width="28" height="8" rx="4" fill="#cbd5e1"/>`;
    }).join("")}
    <circle cx="600" cy="140" r="48" fill="#fbbf24"/>
    <path d="M608 104 L578 148 L600 148 L590 178 L624 130 L602 130 Z" fill="#7c2d12"/>`),

  inverters: frame("#065f46", "#064e3b", `
    <rect x="140" y="150" width="280" height="320" rx="28" fill="#ecfdf5"/>
    <rect x="175" y="195" width="210" height="90" rx="12" fill="#0f172a"/>
    <rect x="195" y="215" width="70" height="14" rx="7" fill="#34d399"/><rect x="195" y="240" width="120" height="14" rx="7" fill="#34d399" opacity="0.6"/>
    <rect x="330" y="215" width="36" height="50" rx="6" fill="#34d399" opacity="0.85"/>
    <circle cx="205" cy="330" r="16" fill="#10b981"/><circle cx="255" cy="330" r="16" fill="#f59e0b"/><circle cx="305" cy="330" r="16" fill="#cbd5e1"/>
    ${[390, 410, 430].map((y) => `<rect x="185" y="${y}" width="190" height="9" rx="4.5" fill="#a7f3d0"/>`).join("")}
    <rect x="470" y="205" width="40" height="30" rx="6" fill="#dc2626"/><rect x="580" y="205" width="40" height="30" rx="6" fill="#1f2937"/>
    <rect x="450" y="230" width="190" height="240" rx="22" fill="#fef3c7"/>
    <rect x="450" y="230" width="190" height="52" rx="22" fill="#fde68a"/>
    <path d="M556 300 L510 380 L546 380 L530 450 L590 360 L554 360 Z" fill="#f59e0b"/>`),

  coolers: frame("#0369a1", "#0c4a6e", `
    <rect x="240" y="100" width="320" height="410" rx="44" fill="#f0f9ff"/>
    <rect x="240" y="100" width="320" height="80" rx="40" fill="#e0f2fe"/>
    <circle cx="300" cy="140" r="16" fill="#0ea5e9"/><circle cx="350" cy="140" r="16" fill="#38bdf8"/><rect x="420" y="128" width="100" height="24" rx="12" fill="#bae6fd"/>
    <circle cx="400" cy="300" r="100" fill="#e0f2fe" stroke="#bae6fd" stroke-width="8"/>
    ${[0, 72, 144, 216, 288].map((deg) => `<ellipse cx="400" cy="250" rx="22" ry="48" fill="#7dd3fc" transform="rotate(${deg} 400 300)"/>`).join("")}
    <circle cx="400" cy="300" r="20" fill="#0284c7"/>
    ${[425, 448, 471].map((y) => `<rect x="280" y="${y}" width="240" height="11" rx="5.5" fill="#bae6fd"/>`).join("")}
    <circle cx="280" cy="518" r="14" fill="#0f172a" opacity="0.6"/><circle cx="520" cy="518" r="14" fill="#0f172a" opacity="0.6"/>
    ${[250, 300, 350].map((y, i) => `<path d="M590 ${y} C 630 ${y - 20} 660 ${y + 20} 700 ${y}" fill="none" stroke="#e0f2fe" stroke-width="9" stroke-linecap="round" opacity="${0.75 - i * 0.15}"/>`).join("")}`),

  heaters: frame("#c2410c", "#7c2d12", `
    ${[300, 400, 500].map((x) => `<path d="M${x} 95 C ${x - 20} 75 ${x + 20} 55 ${x} 35" fill="none" stroke="#fed7aa" stroke-width="9" stroke-linecap="round" opacity="0.7"/>`).join("")}
    <rect x="285" y="110" width="230" height="330" rx="110" fill="#fff7ed"/>
    <rect x="285" y="300" width="230" height="16" fill="#fed7aa"/>
    <circle cx="400" cy="225" r="48" fill="#ffedd5" stroke="#fdba74" stroke-width="8"/>
    <line x1="400" y1="225" x2="426" y2="200" stroke="#ea580c" stroke-width="8" stroke-linecap="round"/>
    <circle cx="370" cy="360" r="10" fill="#ef4444"/><circle cx="400" cy="360" r="10" fill="#22c55e"/>
    <rect x="345" y="438" width="26" height="80" fill="#e5e7eb"/><rect x="429" y="438" width="26" height="80" fill="#e5e7eb"/>
    <rect x="337" y="500" width="42" height="22" rx="6" fill="#3b82f6"/><rect x="421" y="500" width="42" height="22" rx="6" fill="#ef4444"/>
    <path d="M590 330 C 570 360 570 380 590 390 C 610 380 610 360 590 330 Z" fill="#bfdbfe"/>
    <path d="M630 400 C 615 422 615 437 630 444 C 645 437 645 422 630 400 Z" fill="#bfdbfe" opacity="0.8"/>`),

  appliances: frame("#9d174d", "#500724", `
    <path d="M318 150 L482 150 L458 330 L342 330 Z" fill="#e0f2fe" opacity="0.95"/>
    <path d="M335 175 L350 310" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
    <rect x="305" y="120" width="190" height="36" rx="14" fill="#f9a8d4"/>
    <path d="M478 185 C 565 195 565 300 466 310" fill="none" stroke="#fdf2f8" stroke-width="20" stroke-linecap="round"/>
    <path d="M370 300 L430 288 M370 288 L430 300" stroke="#64748b" stroke-width="7" stroke-linecap="round"/>
    <rect x="330" y="328" width="140" height="22" rx="6" fill="#fbcfe8"/>
    <path d="M268 478 L532 478 L505 348 L295 348 Z" fill="#fdf2f8"/>
    <circle cx="400" cy="415" r="30" fill="#be185d"/><circle cx="400" cy="415" r="12" fill="#fdf2f8"/>
    <rect x="290" y="478" width="40" height="16" rx="6" fill="#831843"/><rect x="470" y="478" width="40" height="16" rx="6" fill="#831843"/>`),

  tools: frame("#a16207", "#713f12", `
    <g transform="translate(400 300) rotate(35)">
      <rect x="-17" y="-70" width="34" height="290" rx="15" fill="#d97706"/>
      <rect x="-9" y="-40" width="8" height="240" rx="4" fill="#fbbf24" opacity="0.6"/>
      <rect x="-22" y="150" width="44" height="80" rx="18" fill="#1f2937"/>
      <rect x="-100" y="-150" width="200" height="80" rx="16" fill="#e5e7eb"/>
      <rect x="-100" y="-150" width="200" height="22" rx="11" fill="#f8fafc"/>
      <rect x="70" y="-158" width="44" height="96" rx="12" fill="#cbd5e1"/>
    </g>
    <g transform="translate(400 300) rotate(-35)">
      <rect x="-10" y="-215" width="20" height="230" rx="4" fill="#f1f5f9"/>
      <path d="M-10 -215 L10 -215 L4 -240 L-4 -240 Z" fill="#cbd5e1"/>
      <rect x="-40" y="10" width="80" height="190" rx="36" fill="#ef4444"/>
      <rect x="-14" y="40" width="10" height="130" rx="5" fill="#fca5a5"/>
      <rect x="6" y="40" width="10" height="130" rx="5" fill="#b91c1c"/>
    </g>`),

  pipes: frame("#4d7c0f", "#365314", `
    <path d="M110 395 L470 395 Q 570 395 570 295 L 570 110" fill="none" stroke="#f8fafc" stroke-width="66"/>
    <path d="M110 375 L470 375 Q 550 375 550 295 L 550 110" fill="none" stroke="#ffffff" stroke-width="10" opacity="0.7"/>
    <rect x="290" y="352" width="44" height="86" rx="8" fill="#e2e8f0"/>
    <rect x="527" y="190" width="86" height="40" rx="8" fill="#e2e8f0"/>
    <rect x="160" y="130" width="200" height="180" rx="22" fill="#fefce8"/>
    <rect x="180" y="150" width="160" height="140" rx="14" fill="none" stroke="#d9f99d" stroke-width="6"/>
    <circle cx="260" cy="220" r="42" fill="none" stroke="#bef264" stroke-width="10"/>
    <circle cx="200" cy="170" r="8" fill="#a3e635"/><circle cx="320" cy="170" r="8" fill="#a3e635"/><circle cx="200" cy="270" r="8" fill="#a3e635"/><circle cx="320" cy="270" r="8" fill="#a3e635"/>`),

  motors: frame("#6d28d9", "#3b0764", `
    <rect x="160" y="400" width="330" height="26" rx="8" fill="#c4b5fd"/>
    <rect x="150" y="215" width="300" height="180" rx="34" fill="#ede9fe"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${185 + i * 28}" y="232" width="10" height="146" rx="5" fill="#c4b5fd"/>`).join("")}
    <ellipse cx="160" cy="305" rx="26" ry="88" fill="#ddd6fe"/>
    <rect x="440" y="290" width="40" height="30" fill="#a78bfa"/>
    <rect x="505" y="160" width="56" height="80" rx="8" fill="#f5f3ff"/>
    <rect x="495" y="150" width="76" height="26" rx="8" fill="#ddd6fe"/>
    <circle cx="533" cy="305" r="100" fill="#f5f3ff"/>
    <circle cx="533" cy="305" r="48" fill="#a78bfa"/>
    <circle cx="533" cy="305" r="16" fill="#f5f3ff"/>
    <line x1="625" y1="370" x2="625" y2="335" stroke="#e5e7eb" stroke-width="6"/><line x1="655" y1="370" x2="655" y2="335" stroke="#e5e7eb" stroke-width="6"/>
    <rect x="600" y="368" width="80" height="120" rx="16" fill="#fde68a"/>
    <rect x="600" y="400" width="80" height="12" fill="#fbbf24"/>`),

  other: frame("#57534e", "#292524", `
    <rect x="337" y="105" width="20" height="100" rx="5" fill="#d6d3d1"/>
    <rect x="443" y="105" width="20" height="100" rx="5" fill="#d6d3d1"/>
    <rect x="386" y="75" width="28" height="130" rx="6" fill="#e7e5e4"/>
    <rect x="290" y="190" width="220" height="190" rx="46" fill="#fafaf9"/>
    <rect x="320" y="220" width="160" height="12" rx="6" fill="#e7e5e4"/>
    <path d="M400 380 C 400 480 260 460 220 560" fill="none" stroke="#fafaf9" stroke-width="26" stroke-linecap="round"/>
    <rect x="370" y="372" width="60" height="40" rx="10" fill="#e7e5e4"/>`)
};

/** Category name (from the price list taxonomy) -> picture file. */
export const CATEGORY_IMAGES = {
  Lighting: "lighting",
  Fans: "fans",
  "Switches & Sockets": "switches",
  "Wires & Cables": "wires",
  "MCB & Distribution": "mcb",
  "Inverters & Power": "inverters",
  Coolers: "coolers",
  "Water Heaters": "heaters",
  "Home & Kitchen Appliances": "appliances",
  "Tools & Hardware": "tools",
  "Boxes, Pipes & Fittings": "pipes",
  "Motors, Pumps & Capacitors": "motors",
  Other: "other"
};

mkdirSync(OUT, { recursive: true });
for (const [name, svg] of Object.entries(CATEGORIES)) {
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(join(OUT, `${name}.webp`));
  console.log(`public/categories/${name}.webp`);
}
