// POI categories: badge colour, glyph and names. To add a category, add its id to src/schema.json
// (poi.category) and an entry here. Glyphs are our own drawings on a 24x24 grid, white on the badge.
import type { Lang } from './i18n';

export interface Category {
  color: string;
  /** SVG markup inside a 24x24 viewBox, drawn in white. `C` is replaced by the badge colour for cut-outs. */
  glyph: string;
  label: Record<Lang, string>;
}

const S = (w = 2.2) => `fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

export const CATEGORIES: Record<string, Category> = {
  vehicle: {
    color: '#2f7fd1',
    glyph: `<path fill="#fff" d="M4.5 11.2 6.3 6.6A2.2 2.2 0 0 1 8.4 5.2h7.2a2.2 2.2 0 0 1 2.1 1.4l1.8 4.6v6.6a.9.9 0 0 1-.9.9h-1.5a.9.9 0 0 1-.9-.9v-.9H7.8v.9a.9.9 0 0 1-.9.9H5.4a.9.9 0 0 1-.9-.9z"/>
      <path fill="C" d="M7.1 10.4h9.8l-1.1-3a1 1 0 0 0-.9-.6H9.1a1 1 0 0 0-.9.6z"/>
      <circle fill="C" cx="7.6" cy="13.6" r="1.3"/><circle fill="C" cx="16.4" cy="13.6" r="1.3"/>`,
    label: { en: 'Vehicles', 'zh-Hans': '载具', 'zh-Hant': '載具' },
  },
  weapon: {
    color: '#d6453d',
    glyph: `<circle cx="12" cy="12" r="6" ${S()}/><path ${S()} d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/><circle fill="#fff" cx="12" cy="12" r="1.5"/>`,
    label: { en: 'Weapons', 'zh-Hans': '武器', 'zh-Hant': '武器' },
  },
  'easter-egg': {
    color: '#8a56d6',
    glyph: `<path ${S(2.6)} d="M8.8 9a3.3 3.3 0 1 1 4.9 2.9c-1 .55-1.7 1.3-1.7 2.4v.6"/><circle fill="#fff" cx="12" cy="18.4" r="1.6"/>`,
    label: { en: 'Easter eggs', 'zh-Hans': '彩蛋', 'zh-Hant': '彩蛋' },
  },
  shop: {
    color: '#e0a02e',
    glyph: `<path fill="#fff" d="M5.5 8.5h13l-1 11a1 1 0 0 1-1 .9h-9a1 1 0 0 1-1-.9z"/><path ${S()} d="M9 10V7.5a3 3 0 0 1 6 0V10"/>`,
    label: { en: 'Shops', 'zh-Hans': '商店', 'zh-Hant': '商店' },
  },
  gas: {
    color: '#e5702a',
    glyph: `<rect fill="#fff" x="5" y="4" width="9" height="16" rx="1.4"/><rect fill="C" x="6.8" y="6" width="5.4" height="4.2" rx=".6"/><path ${S(1.8)} d="M14 9h2.2a1.3 1.3 0 0 1 1.3 1.3v5.9a1.3 1.3 0 0 0 2.6 0V8.5L17.8 6"/>`,
    label: { en: 'Gas stations', 'zh-Hans': '加油站', 'zh-Hant': '加油站' },
  },
  'pay-n-spray': {
    color: '#27a065',
    glyph: `<rect fill="#fff" x="7" y="9" width="8" height="12" rx="1.6"/><rect fill="#fff" x="8.6" y="6" width="4.8" height="3.4" rx=".6"/><path ${S(1.8)} d="M13.4 7.6h2.4M18 5l1.6-.8M18.4 7.6h1.8M18 10.2l1.6.8"/>`,
    label: { en: 'Pay ’n’ Spray', 'zh-Hans': '喷漆店', 'zh-Hant': '噴漆店' },
  },
  clothes: {
    color: '#dd5895',
    glyph: `<path fill="#fff" d="M9 4.5 4 7.2l1.6 4 2.3-1V19.5h8.2V10.2l2.3 1 1.6-4-5-2.7c-.4 1.4-1.6 2.3-3 2.3S9.4 5.9 9 4.5z"/>`,
    label: { en: 'Clothes', 'zh-Hans': '服装店', 'zh-Hant': '服飾店' },
  },
  barber: {
    color: '#4a5fd0',
    glyph: `<circle cx="7.5" cy="16.5" r="2.6" ${S(2)}/><circle cx="16.5" cy="16.5" r="2.6" ${S(2)}/><path ${S(2)} d="M9.3 14.6 17.5 4M14.7 14.6 6.5 4"/>`,
    label: { en: 'Barbers', 'zh-Hans': '理发店', 'zh-Hant': '理髮店' },
  },
  tattoo: {
    color: '#6b47c9',
    glyph: `<path fill="#fff" d="M12 3.5c2.8 4 4.8 6.8 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-2.8 2-5.6 4.8-9.6z"/><path fill="none" stroke="C" stroke-width="1.6" stroke-linecap="round" d="M10.2 13.6a1.9 1.9 0 0 0 1.8 1.9"/>`,
    label: { en: 'Tattoo parlors', 'zh-Hans': '纹身店', 'zh-Hant': '刺青店' },
  },
  food: {
    color: '#d98a2b',
    glyph: `<path ${S(2)} d="M7 4v6a2 2 0 0 0 2 2M11 4v6a2 2 0 0 1-2 2v8.5M9 4v5"/><path fill="#fff" d="M15.5 20.5V4c2.2 1 3.3 3.4 3.3 6.4V13h-1.6v7.5z"/>`,
    label: { en: 'Food', 'zh-Hans': '餐饮', 'zh-Hant': '餐飲' },
  },
  safehouse: {
    color: '#239c8e',
    glyph: `<path fill="#fff" d="M12 4 3.8 11h2.4v8.4h4v-5h3.6v5h4V11h2.4z"/>`,
    label: { en: 'Safehouses', 'zh-Hans': '安全屋', 'zh-Hant': '安全屋' },
  },
  landmark: {
    color: '#c99a1c',
    glyph: `<path fill="#fff" d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z"/>`,
    label: { en: 'Landmarks', 'zh-Hans': '地标', 'zh-Hant': '地標' },
  },
  activity: {
    color: '#1d93cf',
    glyph: `<path ${S()} d="M6.5 20.5V4"/><path fill="#fff" d="M7.5 4.5h10.5l-2.4 3.7 2.4 3.7H7.5z"/>`,
    label: { en: 'Activities', 'zh-Hans': '活动', 'zh-Hant': '活動' },
  },
  collectible: {
    color: '#c23d83',
    glyph: `<path fill="#fff" d="M7.5 4.5h9l3.5 4.6L12 20 4 9.1z"/><path fill="none" stroke="C" stroke-width="1.3" stroke-linejoin="round" d="M4.3 9.1h15.4M9.5 4.7 12 9.1l2.5-4.4M12 9.1V19.5"/>`,
    label: { en: 'Collectibles', 'zh-Hans': '收集品', 'zh-Hant': '收集品' },
  },
};

export const FALLBACK: Category = {
  color: '#5f6b8a',
  glyph: '<circle fill="#fff" cx="12" cy="12" r="4.5"/>',
  label: { en: 'Other', 'zh-Hans': '其他', 'zh-Hant': '其他' },
};

export function category(id: string): Category {
  return CATEGORIES[id] ?? FALLBACK;
}

/** The badge as a standalone SVG: rounded square in the category colour, thin light ring, white glyph. */
export function badgeSVG(id: string, size = 28): string {
  const c = category(id);
  const glyph = c.glyph.replaceAll('"C"', `"${c.color}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">` +
    `<rect x="1" y="1" width="26" height="26" rx="7.5" fill="${c.color}" stroke="#fff" stroke-opacity=".92" stroke-width="1.6"/>` +
    `<g transform="translate(3.2 3.2) scale(.9)">${glyph}</g></svg>`;
}
