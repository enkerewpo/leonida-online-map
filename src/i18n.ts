export type Lang = 'en' | 'zh-Hans' | 'zh-Hant';
export const LANGS: Lang[] = ['en', 'zh-Hans', 'zh-Hant'];
export const LANG_LABEL: Record<Lang, string> = { en: 'EN', 'zh-Hans': '简', 'zh-Hant': '繁' };
export const LANG_NAME: Record<Lang, string> = { en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文' };

const STORAGE_KEY = 'leonida-map:lang';

/** zh-TW / zh-HK / zh-MO / zh-Hant go to Traditional, any other zh to Simplified, everything else to English. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  } catch { /* storage blocked */ }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const raw of prefs) {
    const l = raw.toLowerCase();
    if (!l.startsWith('zh')) {
      if (l.startsWith('en')) return 'en';
      continue;
    }
    if (/^zh-(tw|hk|mo)\b|hant/.test(l)) return 'zh-Hant';
    return 'zh-Hans';
  }
  return 'en';
}

export function saveLang(lang: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage blocked */ }
}

type Strings = typeof en;

const en = {
  title: 'Leonida Online Map',
  wordmark: 'Leonida',
  subtitle: 'Fan-made map',
  searchPlaceholder: 'Search places and finds',
  searchLabel: 'Search the map',
  clearSearch: 'Clear search',
  noResults: 'Nothing matches “{q}”.',
  layers: 'Layers',
  buildings: 'Buildings',
  labels: 'Labels',
  finds: 'Finds',
  notPinned: 'Location not pinned yet',
  back: 'Back',
  close: 'Close',
  where: 'Where',
  note: 'Note',
  source: 'Source',
  copyLink: 'Copy link',
  copied: 'Link copied',
  showOnMap: 'Show on map',
  areaRadius: 'Search area about {r} m across',
  about: 'About',
  language: 'Language',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetNorth: 'Reset north',
  tilt: '3D view',
  fit: 'Show all of Leonida',
  expand: 'Expand panel',
  collapse: 'Collapse panel',
  mapLabel: 'Map of Leonida',
  loading: 'Loading map',
  loadError: 'Some map data failed to load. Try reloading the page.',
  webglError: 'This map needs WebGL, which your browser has turned off or does not support.',
  disclaimer: 'Unofficial fan project. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Grand Theft Auto and related marks are trademarks of Take-Two Interactive.',
  shortCredit: 'Fan map. Traced from the in-game map tiles of map.gtadb.org (CC BY 4.0) and Rockstar’s official Leonida map.',
  aboutTitle: 'About this map',
  aboutIntro: 'A free, open-source vector map of the state of Leonida, drawn by fans and kept up by the community. No ads, no tracking, no spoilers.',
  sourcesTitle: 'Sources',
  sourcesMap: 'Roads, buildings and areas are traced from “GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org” (the in-game map, by GTADB.ORG and contributors; changed: vectorised), aligned to and named after the Leonida map Rockstar Games released at rockstargames.com/VI/media. Map art © Rockstar Games, used for non-commercial fan purposes and removed on request.',
  sourcesFinds: 'Finds and place names come from community contributors. Each entry links to where it was checked.',
  licencesTitle: 'Licences',
  licenceCode: 'Code: MIT',
  licenceData: 'Map data: CC BY-NC-SA 4.0',
  licenceFonts: 'Fonts: Jost, Inter, Noto Sans SC and Noto Sans TC under the SIL Open Font License 1.1',
  contribute: 'Contribute on GitHub',
  flag_day: 'Daytime only',
  flag_night: 'Night only',
  flag_alarm: 'Alarm fitted',
  flag_tracker: 'Tracker fitted',
  flag_random: 'Random spawn',
  flag_later: 'Appears later',
  kind_state: 'State',
  kind_county: 'County',
  kind_city: 'City',
  kind_town: 'Town',
  kind_district: 'District',
  kind_island: 'Island',
  kind_water: 'Water',
  kind_airport: 'Airport',
  kind_landmark: 'Landmark',
};

const zhHans: Strings = {
  title: '雷奥奈达在线地图',
  wordmark: 'Leonida',
  subtitle: '玩家自制地图',
  searchPlaceholder: '搜索地点和收集品',
  searchLabel: '搜索地图',
  clearSearch: '清除搜索',
  noResults: '没有找到“{q}”。',
  layers: '图层',
  buildings: '建筑',
  labels: '地名',
  finds: '收集与发现',
  notPinned: '位置尚未标注',
  back: '返回',
  close: '关闭',
  where: '位置',
  note: '备注',
  source: '来源',
  copyLink: '复制链接',
  copied: '链接已复制',
  showOnMap: '在地图上显示',
  areaRadius: '搜索范围直径约 {r} 米',
  about: '关于',
  language: '语言',
  zoomIn: '放大',
  zoomOut: '缩小',
  resetNorth: '指北',
  tilt: '3D 视图',
  fit: '显示整个雷奥奈达',
  expand: '展开面板',
  collapse: '收起面板',
  mapLabel: '雷奥奈达地图',
  loading: '地图加载中',
  loadError: '部分地图数据加载失败，请刷新页面重试。',
  webglError: '此地图需要 WebGL，你的浏览器已关闭或不支持。',
  disclaimer: 'Unofficial fan project. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Grand Theft Auto and related marks are trademarks of Take-Two Interactive.\n非官方玩家项目，与 Rockstar Games 及 Take-Two Interactive 无关，也未获其认可。Grand Theft Auto 及相关标志为 Take-Two Interactive 的商标。',
  shortCredit: '玩家自制地图，描自 map.gtadb.org 的游戏内地图瓦片（CC BY 4.0）和 Rockstar 官方雷奥奈达地图。',
  aboutTitle: '关于本地图',
  aboutIntro: '一份免费、开源的雷奥奈达州矢量地图，由玩家绘制、社区维护。无广告，无追踪，无剧透。',
  sourcesTitle: '来源',
  sourcesMap: '道路、建筑和区域描自“GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org”（游戏内地图，GTADB.ORG 及贡献者整理；本项目将其矢量化），并按 Rockstar Games 在 rockstargames.com/VI/media 发布的雷奥奈达地图对齐和命名。地图美术 © Rockstar Games，仅作非商业玩家用途，应要求即删除。',
  sourcesFinds: '收集品和地名来自社区贡献者，每一条都附有核实出处。',
  licencesTitle: '许可',
  licenceCode: '代码：MIT',
  licenceData: '地图数据：CC BY-NC-SA 4.0',
  licenceFonts: '字体：Jost、Inter、Noto Sans SC、Noto Sans TC，均为 SIL Open Font License 1.1',
  contribute: '在 GitHub 上参与',
  flag_day: '仅白天',
  flag_night: '仅夜晚',
  flag_alarm: '有警报',
  flag_tracker: '有追踪器',
  flag_random: '随机刷新',
  flag_later: '后期出现',
  kind_state: '州',
  kind_county: '县',
  kind_city: '城市',
  kind_town: '城镇',
  kind_district: '街区',
  kind_island: '岛屿',
  kind_water: '水域',
  kind_airport: '机场',
  kind_landmark: '地标',
};

const zhHant: Strings = {
  title: '雷奧奈達線上地圖',
  wordmark: 'Leonida',
  subtitle: '玩家自製地圖',
  searchPlaceholder: '搜尋地點和收集品',
  searchLabel: '搜尋地圖',
  clearSearch: '清除搜尋',
  noResults: '找不到「{q}」。',
  layers: '圖層',
  buildings: '建築',
  labels: '地名',
  finds: '收集與發現',
  notPinned: '位置尚未標註',
  back: '返回',
  close: '關閉',
  where: '位置',
  note: '備註',
  source: '來源',
  copyLink: '複製連結',
  copied: '連結已複製',
  showOnMap: '在地圖上顯示',
  areaRadius: '搜尋範圍直徑約 {r} 公尺',
  about: '關於',
  language: '語言',
  zoomIn: '放大',
  zoomOut: '縮小',
  resetNorth: '指北',
  tilt: '3D 檢視',
  fit: '顯示整個雷奧奈達',
  expand: '展開面板',
  collapse: '收合面板',
  mapLabel: '雷奧奈達地圖',
  loading: '地圖載入中',
  loadError: '部分地圖資料載入失敗，請重新整理頁面。',
  webglError: '此地圖需要 WebGL，你的瀏覽器已關閉或不支援。',
  disclaimer: 'Unofficial fan project. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Grand Theft Auto and related marks are trademarks of Take-Two Interactive.\n非官方玩家專案，與 Rockstar Games 及 Take-Two Interactive 無關，亦未獲其認可。Grand Theft Auto 及相關標誌為 Take-Two Interactive 的商標。',
  shortCredit: '玩家自製地圖，描自 map.gtadb.org 的遊戲內地圖圖磚（CC BY 4.0）和 Rockstar 官方雷奧奈達地圖。',
  aboutTitle: '關於本地圖',
  aboutIntro: '一份免費、開源的雷奧奈達州向量地圖，由玩家繪製、社群維護。無廣告，無追蹤，無劇透。',
  sourcesTitle: '來源',
  sourcesMap: '道路、建築和區域描自「GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org」（遊戲內地圖，GTADB.ORG 及貢獻者整理；本專案將其向量化），並依 Rockstar Games 在 rockstargames.com/VI/media 發佈的雷奧奈達地圖對齊與命名。地圖美術 © Rockstar Games，僅作非商業玩家用途，應要求即移除。',
  sourcesFinds: '收集品和地名來自社群貢獻者，每一條都附有查證出處。',
  licencesTitle: '授權',
  licenceCode: '程式碼：MIT',
  licenceData: '地圖資料：CC BY-NC-SA 4.0',
  licenceFonts: '字型：Jost、Inter、Noto Sans SC、Noto Sans TC，皆為 SIL Open Font License 1.1',
  contribute: '在 GitHub 上參與',
  flag_day: '僅白天',
  flag_night: '僅夜晚',
  flag_alarm: '有警報',
  flag_tracker: '有追蹤器',
  flag_random: '隨機出現',
  flag_later: '後期出現',
  kind_state: '州',
  kind_county: '郡',
  kind_city: '城市',
  kind_town: '城鎮',
  kind_district: '街區',
  kind_island: '島嶼',
  kind_water: '水域',
  kind_airport: '機場',
  kind_landmark: '地標',
};

const TABLE: Record<Lang, Strings> = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant };
export type StringKey = keyof Strings;

let current: Lang = 'en';
export function setLang(l: Lang): void { current = l; }
export function lang(): Lang { return current; }

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = TABLE[current][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** A localised property (`name`, `area`, `where`, `note`) with fallback to the plain key, then English. */
export function prop(p: Record<string, unknown> | null | undefined, key: string, l: Lang = current): string {
  if (!p) return '';
  const v = p[`${key}:${l}`] ?? p[key] ?? p[`${key}:en`];
  return typeof v === 'string' ? v : '';
}
