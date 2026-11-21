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
  // Finds still to come.
  hideout: {
    color: '#3c8f5a',
    glyph: `<path fill="#fff" d="M5 20.5V8.5h2.4V6h2.2v2.5h1.2V6h2.4v2.5h1.2V6h2.2v2.5H19v12h-5.2v-4.6a1.8 1.8 0 0 0-3.6 0v4.6z"/>`,
    label: { en: 'Hideouts', 'zh-Hans': '据点', 'zh-Hant': '據點' },
  },
  freebie: {
    color: '#d4486e',
    glyph: `<rect fill="#fff" x="4.5" y="10" width="15" height="10" rx="1"/><rect fill="#fff" x="3.5" y="7" width="17" height="3.6" rx="1"/><path fill="C" d="M11 7h2v13h-2z"/><path ${S(1.8)} d="M12 7c-1.2-2.6-4.6-3-4.6-1 0 1.2 2.2 1 4.6 1zM12 7c1.2-2.6 4.6-3 4.6-1 0 1.2-2.2 1-4.6 1z"/>`,
    label: { en: 'Freebies', 'zh-Hans': '福利', 'zh-Hant': '福利' },
  },
  'hidden-item': {
    color: '#7b4fc4',
    glyph: `<circle cx="10.5" cy="10.5" r="5.6" ${S(2.4)}/><path ${S(2.8)} d="m15 15 4.8 4.8"/>`,
    label: { en: 'Hidden items', 'zh-Hans': '隐藏物', 'zh-Hant': '隱藏物' },
  },
  nightclub: {
    color: '#b8479e',
    glyph: `<path ${S(2.2)} d="M9.5 17.5V6l9-2v11.5"/><ellipse fill="#fff" cx="7.4" cy="17.6" rx="2.6" ry="2.1"/><ellipse fill="#fff" cx="16.4" cy="15.6" rx="2.6" ry="2.1"/>`,
    label: { en: 'Nightclubs', 'zh-Hans': '夜店', 'zh-Hant': '夜店' },
  },
  // Landmarks (GTADB landmark data).
  building: {
    color: '#6c7f9a',
    glyph: `<rect fill="#fff" x="6" y="3.5" width="12" height="17" rx="1"/><path fill="C" d="M8.4 6h2.2v2.2H8.4zM13.4 6h2.2v2.2h-2.2zM8.4 10.4h2.2v2.2H8.4zM13.4 10.4h2.2v2.2h-2.2zM10.6 15.6h2.8v4.9h-2.8z"/>`,
    label: { en: 'Buildings', 'zh-Hans': '建筑', 'zh-Hant': '建築' },
  },
  transit: {
    color: '#2b8fbf',
    glyph: `<rect fill="#fff" x="5.5" y="3.5" width="13" height="14" rx="2.6"/><path fill="C" d="M7.4 6.4h9.2v5H7.4z"/><circle fill="C" cx="9" cy="14.4" r="1.1"/><circle fill="C" cx="15" cy="14.4" r="1.1"/><path ${S(2)} d="m8.5 17.5-1.5 3M15.5 17.5l1.5 3"/>`,
    label: { en: 'Transit', 'zh-Hans': '公共交通', 'zh-Hant': '大眾運輸' },
  },
  industrial: {
    color: '#7d6f5e',
    glyph: `<path fill="#fff" d="M3.5 20.5V11l5 3V11l5 3V11l5 3V4h2.5v16.5z"/>`,
    label: { en: 'Industry', 'zh-Hans': '工业', 'zh-Hant': '工業' },
  },
  nature: {
    color: '#3f9a4f',
    glyph: `<path fill="#fff" d="M12 3 5.5 13h3.2L5 18.5h6v2.5h2v-2.5h6L15.3 13h3.2z"/>`,
    label: { en: 'Nature', 'zh-Hans': '自然', 'zh-Hant': '自然' },
  },
  civic: {
    color: '#5b6fc0',
    glyph: `<path fill="#fff" d="M12 3.5 3.5 8v1.8h17V8zM5 18.5h14v2H5z"/><path ${S(2)} d="M7 11.5v5.5M12 11.5v5.5M17 11.5v5.5"/>`,
    label: { en: 'Public buildings', 'zh-Hans': '公共建筑', 'zh-Hant': '公共建築' },
  },
  leisure: {
    color: '#1fa3a0',
    glyph: `<path fill="#fff" d="M3.5 11.5A8.5 8.5 0 0 1 20.5 11.5z"/><path ${S(2)} d="M12 11.5v7.5a1.6 1.6 0 0 1-3.2 0"/>`,
    label: { en: 'Leisure', 'zh-Hans': '休闲', 'zh-Hant': '休閒' },
  },
  hotel: {
    color: '#8a5cc7',
    glyph: `<path fill="#fff" d="M3.5 6h2.4v7h14.6v6h-2.4v-2.4H5.9V19H3.5z"/><circle fill="#fff" cx="9" cy="10" r="2.2"/><path fill="#fff" d="M12.4 8.2h5.4a2.7 2.7 0 0 1 2.7 2.7v1.3h-8.1z"/>`,
    label: { en: 'Hotels', 'zh-Hans': '酒店', 'zh-Hant': '飯店' },
  },
  residential: {
    color: '#6f8f6a',
    glyph: `<path fill="#fff" d="M12 4 4 11h2.3v8.5h11.4V11H20z"/><path fill="C" d="M10.4 14h3.2v5.5h-3.2z"/>`,
    label: { en: 'Residential', 'zh-Hans': '住宅', 'zh-Hant': '住宅' },
  },
  airport: {
    color: '#3e7fd6',
    glyph: `<path fill="#fff" d="M10.8 3.6a1.2 1.2 0 0 1 2.4 0V9l7.3 4.4v2l-7.3-2.2v4.3l2.2 1.6v1.6L12 19.8l-3.4.9v-1.6l2.2-1.6v-4.3l-7.3 2.2v-2L10.8 9z"/>`,
    label: { en: 'Airports', 'zh-Hans': '机场', 'zh-Hant': '機場' },
  },
  sport: {
    color: '#2f9e74',
    glyph: `<circle cx="12" cy="12" r="7.6" ${S(2)}/><path ${S(1.8)} d="M4.6 10.2c4.6 0 9.6 2.4 11.8 8.4M9.4 4.8c2.6 3.4 3.6 8.8 1.6 14.6"/>`,
    label: { en: 'Sports', 'zh-Hans': '体育', 'zh-Hant': '體育' },
  },
  venue: {
    color: '#c75a8a',
    glyph: `<path fill="#fff" d="M3.5 7.5h17v3a1.8 1.8 0 0 0 0 3.6v3.4h-17v-3.4a1.8 1.8 0 0 0 0-3.6z"/><path fill="none" stroke="C" stroke-width="1.4" stroke-dasharray="1.6 1.4" d="M15 8v9"/>`,
    label: { en: 'Venues', 'zh-Hans': '演出场所', 'zh-Hant': '表演場地' },
  },
  office: {
    color: '#5d7187',
    glyph: `<rect fill="#fff" x="3.5" y="8" width="17" height="11.5" rx="1.6"/><path ${S(2)} d="M9 8V6a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 6v2"/><path fill="C" d="M3.5 12.6h17v1.4h-17z"/>`,
    label: { en: 'Offices', 'zh-Hans': '办公', 'zh-Hant': '辦公' },
  },
  marina: {
    color: '#2672b8',
    glyph: `<circle cx="12" cy="6" r="2" ${S(2)}/><path ${S(2.2)} d="M12 8v12M8 11.5h8M5 14.5a7 7 0 0 0 14 0"/>`,
    label: { en: 'Marinas', 'zh-Hans': '码头', 'zh-Hant': '碼頭' },
  },
  club: {
    color: '#b8479e',
    glyph: `<path ${S(2.2)} d="M9.5 17.5V6l9-2v11.5"/><ellipse fill="#fff" cx="7.4" cy="17.6" rx="2.6" ry="2.1"/><ellipse fill="#fff" cx="16.4" cy="15.6" rx="2.6" ry="2.1"/>`,
    label: { en: 'Clubs', 'zh-Hans': '夜店', 'zh-Hant': '夜店' },
  },
  guns: {
    color: '#c9483f',
    glyph: `<path fill="#fff" d="M3.5 7h17v4.2h-7.6l-.8 2.2H9.6l-1.2 6.1H4.6l1.6-8.3H3.5z"/>`,
    label: { en: 'Gun shops', 'zh-Hans': '枪店', 'zh-Hant': '槍店' },
  },
  bar: {
    color: '#c7792f',
    glyph: `<path fill="#fff" d="M4.5 5h15L12 13z"/><path ${S(2)} d="M12 12.5v7M8.5 20h7"/>`,
    label: { en: 'Bars', 'zh-Hans': '酒吧', 'zh-Hant': '酒吧' },
  },
  salon: {
    color: '#4a5fd0',
    glyph: `<circle cx="7.5" cy="16.5" r="2.6" ${S(2)}/><circle cx="16.5" cy="16.5" r="2.6" ${S(2)}/><path ${S(2)} d="M9.3 14.6 17.5 4M14.7 14.6 6.5 4"/>`,
    label: { en: 'Salons', 'zh-Hans': '美发沙龙', 'zh-Hant': '美髮沙龍' },
  },
  police: {
    color: '#3459b5',
    glyph: `<path fill="#fff" d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path fill="C" d="m12 8 1.2 2.5 2.7.3-2 1.9.5 2.7L12 14.1l-2.4 1.3.5-2.7-2-1.9 2.7-.3z"/>`,
    label: { en: 'Police', 'zh-Hans': '警察局', 'zh-Hant': '警察局' },
  },
  modshop: {
    color: '#d0632f',
    glyph: `<path fill="#fff" d="M14.8 3.8a4.6 4.6 0 0 0-4.4 6.1l-6.3 6.3a2 2 0 0 0 2.8 2.8l6.3-6.3a4.6 4.6 0 0 0 6.1-4.4l-2.7 2.7-2.6-.6-.6-2.6z"/>`,
    label: { en: 'Mod shops', 'zh-Hans': '改装店', 'zh-Hant': '改裝店' },
  },
  hospital: {
    color: '#d2414f',
    glyph: `<path fill="#fff" d="M9.6 4h4.8v5.6H20v4.8h-5.6V20H9.6v-5.6H4V9.6h5.6z"/>`,
    label: { en: 'Hospitals', 'zh-Hans': '医院', 'zh-Hant': '醫院' },
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

/** Landmark categories in layer groups, as a map app's filter list. */
export const LANDMARK_GROUPS: { id: string; label: Record<Lang, string>; icon: string; cats: string[] }[] = [
  { id: 'shops', icon: 'shop', label: { en: 'Shops & services', 'zh-Hans': '商店与服务', 'zh-Hant': '商店與服務' }, cats: ['shop', 'clothes', 'salon', 'guns', 'modshop', 'gas'] },
  { id: 'food', icon: 'food', label: { en: 'Food & nightlife', 'zh-Hans': '餐饮与夜生活', 'zh-Hant': '餐飲與夜生活' }, cats: ['food', 'bar', 'club'] },
  { id: 'stay', icon: 'hotel', label: { en: 'Hotels & leisure', 'zh-Hans': '酒店与休闲', 'zh-Hant': '飯店與休閒' }, cats: ['hotel', 'leisure', 'sport', 'venue', 'nature'] },
  { id: 'transport', icon: 'transit', label: { en: 'Transport', 'zh-Hans': '交通', 'zh-Hant': '交通' }, cats: ['transit', 'airport', 'marina'] },
  { id: 'public', icon: 'civic', label: { en: 'Public services', 'zh-Hans': '公共服务', 'zh-Hant': '公共服務' }, cats: ['civic', 'police', 'hospital'] },
  { id: 'places', icon: 'landmark', label: { en: 'Landmarks & buildings', 'zh-Hans': '地标与建筑', 'zh-Hant': '地標與建築' }, cats: ['landmark', 'building', 'office', 'residential', 'industrial', 'safehouse'] },
];

/** A landmark's group id; anything unknown falls into the last group. */
export function landmarkGroup(cat: string): string {
  return (LANDMARK_GROUPS.find((g) => g.cats.includes(cat)) ?? LANDMARK_GROUPS[LANDMARK_GROUPS.length - 1]).id;
}

/** Round map blip for a landmark: category colour, thin light ring, white glyph. */
export function blipSVG(id: string, size = 22): string {
  const c = category(id);
  const glyph = c.glyph.replaceAll('"C"', `"${c.color}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">` +
    `<circle cx="14" cy="14" r="12.6" fill="${c.color}" stroke="#fff" stroke-opacity=".95" stroke-width="1.6"/>` +
    `<g transform="translate(4.4 4.4) scale(.8)">${glyph}</g></svg>`;
}
