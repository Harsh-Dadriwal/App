export type LightingProduct = {
  id: string;
  brand: string;
  product_name: string;
  category: string;
  sku?: string | null;
  cri: number;
  kelvin: number;
  ugr: number;
  lumens: number;
  beam_angle?: number | null;
  finish?: string | null;
  summary?: string | null;
  hero_badge?: string | null;
};

export type LightingScene = {
  kelvin: number;
  cri: number;
  ugr: number;
  lumens: number;
};

export type LightingLeadConfig = {
  productId?: string | null;
  productName?: string | null;
  brand?: string | null;
  kelvin: number;
  cri: number;
  ugr: number;
  lumens: number;
  comparePosition: number;
  roomType: string;
};

export const lightingEducation = {
  cri: {
    en: "CRI shows how natural colors look under a light. Higher CRI means fabrics, wood, skin tones, and paint look richer and closer to real life.",
    hi: "CRI batata hai ki light ke neeche colors kitne natural dikhte hain. High CRI mein kapde, wood, skin tone aur paint zyada real aur rich lagte hain."
  },
  ugr: {
    en: "UGR measures glare. Lower UGR feels comfortable and premium, while higher UGR can feel harsh or tiring on the eyes.",
    hi: "UGR glare ko measure karta hai. Low UGR zyada comfortable aur premium feel deta hai, jabki high UGR aankhon ko chubhne wala lag sakta hai."
  }
} as const;

export const retailBaselineScene: LightingScene = {
  kelvin: 4300,
  cri: 72,
  ugr: 24,
  lumens: 780
};

const roomSceneSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8ddd3"/>
      <stop offset="100%" stop-color="#d6c7ba"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8b6a51"/>
      <stop offset="100%" stop-color="#5f4633"/>
    </linearGradient>
    <linearGradient id="window" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b5d7ef"/>
      <stop offset="100%" stop-color="#f4f7fb"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="#cab9a8"/>
  <rect x="0" y="0" width="1600" height="700" fill="url(#wall)"/>
  <polygon points="0,650 1600,650 1600,1000 0,1000" fill="url(#floor)"/>
  <rect x="1010" y="145" width="370" height="340" rx="18" fill="url(#window)"/>
  <rect x="995" y="130" width="400" height="370" rx="24" fill="none" stroke="#f6ede5" stroke-width="18"/>
  <line x1="1195" y1="145" x2="1195" y2="485" stroke="#f6ede5" stroke-width="12"/>
  <line x1="1010" y1="315" x2="1380" y2="315" stroke="#f6ede5" stroke-width="12"/>
  <rect x="180" y="440" width="720" height="180" rx="46" fill="#d2b195"/>
  <rect x="215" y="395" width="250" height="120" rx="38" fill="#d8b79b"/>
  <rect x="470" y="395" width="220" height="110" rx="34" fill="#dcbfa6"/>
  <rect x="695" y="415" width="170" height="105" rx="30" fill="#cfa98b"/>
  <rect x="260" y="585" width="92" height="145" rx="20" fill="#5b4331"/>
  <rect x="730" y="585" width="92" height="145" rx="20" fill="#5b4331"/>
  <rect x="960" y="555" width="270" height="55" rx="18" fill="#4f3c30"/>
  <rect x="995" y="490" width="200" height="75" rx="22" fill="#ead9ca"/>
  <circle cx="1095" cy="780" r="128" fill="#b89271" opacity="0.48"/>
  <ellipse cx="535" cy="740" rx="370" ry="95" fill="#2c2118" opacity="0.25"/>
  <circle cx="370" cy="270" r="74" fill="#f4ede6"/>
  <rect x="340" y="270" width="60" height="165" rx="20" fill="#d8cbc0"/>
  <circle cx="225" cy="120" r="16" fill="#f8f6f2"/>
  <circle cx="800" cy="100" r="16" fill="#f8f6f2"/>
  <circle cx="1370" cy="120" r="16" fill="#f8f6f2"/>
</svg>
`;

export const roomSceneDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(roomSceneSvg)}`;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sceneFromProduct(product?: LightingProduct | null, overrides?: Partial<LightingScene>): LightingScene {
  const base = product
    ? {
        kelvin: product.kelvin,
        cri: product.cri,
        ugr: product.ugr,
        lumens: product.lumens
      }
    : retailBaselineScene;

  return {
    kelvin: clamp(overrides?.kelvin ?? base.kelvin, 2700, 6500),
    cri: clamp(overrides?.cri ?? base.cri, 60, 98),
    ugr: clamp(overrides?.ugr ?? base.ugr, 10, 30),
    lumens: clamp(overrides?.lumens ?? base.lumens, 400, 2400)
  };
}

export function kelvinOverlay(scene: LightingScene) {
  const warmth = clamp((4500 - scene.kelvin) / 1800, 0, 1);
  const coolness = clamp((scene.kelvin - 4500) / 1800, 0, 1);
  return {
    warmOpacity: Number((warmth * 0.42).toFixed(3)),
    coolOpacity: Number((coolness * 0.34).toFixed(3))
  };
}

export function criVisual(scene: LightingScene) {
  const saturation = 0.65 + ((scene.cri - 60) / 38) * 0.65;
  const dullOverlay = clamp((85 - scene.cri) / 30, 0, 0.28);
  return {
    saturation: Number(saturation.toFixed(3)),
    dullOverlay: Number(dullOverlay.toFixed(3))
  };
}

export function ugrVisual(scene: LightingScene) {
  const glare = clamp((scene.ugr - 10) / 18, 0, 1);
  return {
    blur: Number((4 + glare * 18).toFixed(2)),
    glowOpacity: Number((0.16 + glare * 0.32).toFixed(3)),
    glowScale: Number((0.8 + glare * 0.55).toFixed(3))
  };
}

export function lumensVisual(scene: LightingScene) {
  const level = clamp((scene.lumens - 500) / 1800, 0, 1);
  return {
    brightness: Number((0.82 + level * 0.4).toFixed(3)),
    vignette: Number((0.22 - level * 0.1).toFixed(3))
  };
}

export function formatLightingSpec(product: LightingProduct) {
  return `${product.cri} CRI • ${product.kelvin}K • UGR ${product.ugr} • ${product.lumens} lm`;
}
