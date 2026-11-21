import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, LngLatBoundsLike } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './fonts.css';
import './styles.css';

import { detectLang, saveLang, setLang, lang, t, prop, LANGS, LANG_LABEL, LANG_NAME, type Lang, type StringKey } from './i18n';
import { buildStyle, nameField, spacing, LABEL_LAYERS } from './style';
import { prepareImages, addImages } from './images';
import { fetchLayer, withHeights, pinned, searchAreas, type FC, type Feature } from './data';
import { bboxOf, ROUGH_BOUNDS, type BBox } from './geo';
import { CATEGORIES, category, badgeSVG } from './categories';
import { buildIndex, search, type Entry } from './search';
import { readHash, writeHash } from './hash';
import { ICONS } from './ui-icons';

maplibregl.setWorkerUrl(workerUrl);

const REPO = 'https://github.com/enkerewpo/leonida-online-map';
const CJK_FONTS = '"Noto Sans SC","Noto Sans TC",sans-serif';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phoneQuery = matchMedia('(max-width: 719px)');

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

// ---------------------------------------------------------------------------------------------
// State

setLang(detectLang());

const state = {
  places: [] as Feature[],
  pois: [] as Feature[],
  index: [] as Entry[],
  landBBox: ROUGH_BOUNDS as BBox,
  selected: null as string | null,
  query: '',
  hiddenCats: new Set<string>(),
  showBuildings: true,
  showLabels: true,
  sheet: 'peek' as 'peek' | 'half' | 'full',
};

let map: MLMap | null = null;
let mapReady = false;

// ---------------------------------------------------------------------------------------------
// Static DOM

const app = $('#app');
app.innerHTML = `
  <div id="map" class="map"></div>
  <section id="panel" class="panel" data-sheet="peek">
    <button class="sheet-handle" id="sheet-handle" type="button"><span></span></button>
    <header class="panel-head">
      <div class="brand">
        <span class="mark">${ICONS.mark}</span>
        <div class="brand-text">
          <h1 class="wordmark">Leonida</h1>
          <p class="brand-sub" data-t="subtitle"></p>
        </div>
      </div>
      <div class="head-actions">
        <div class="lang-switch" role="group" id="lang-switch">
          ${LANGS.map((l) => `<button type="button" data-lang="${l}" lang="${l}" title="${LANG_NAME[l]}" aria-label="${LANG_NAME[l]}">${LANG_LABEL[l]}</button>`).join('')}
        </div>
        <button class="icon-btn" type="button" id="about-btn" data-t-label="about">${ICONS.info}</button>
      </div>
    </header>
    <div class="search" role="search">
      <span class="search-icon">${ICONS.search}</span>
      <input id="q" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" />
      <button class="search-clear" type="button" id="q-clear" hidden>${ICONS.close}</button>
    </div>
    <div class="panel-body" id="body" tabindex="-1"></div>
    <footer class="panel-foot">
      <p data-t="shortCredit"></p>
      <button type="button" class="link-btn" id="about-link" data-t="about"></button>
    </footer>
  </section>
  <div class="map-controls" id="controls">
    <div class="ctl-group">
      <button type="button" id="zoom-in" data-t-label="zoomIn">${ICONS.plus}</button>
      <button type="button" id="zoom-out" data-t-label="zoomOut">${ICONS.minus}</button>
    </div>
    <div class="ctl-group">
      <button type="button" id="compass" data-t-label="resetNorth"><span class="needle">${ICONS.compass}</span></button>
      <button type="button" id="tilt" data-t-label="tilt" aria-pressed="false">${ICONS.cube}</button>
      <button type="button" id="fit" data-t-label="fit">${ICONS.fit}</button>
    </div>
  </div>
  <div class="map-credit" id="credit">
    <span>Map geometry © Rockstar Games · fan use</span>
    <button type="button" class="link-btn" id="credit-about" data-t="about"></button>
  </div>
  <div class="loading" data-t="loading" aria-hidden="true"></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <dialog id="about" class="about"></dialog>
`;

const panel = $('#panel');
const body = $('#body');
const input = $<HTMLInputElement>('#q');
const clearBtn = $<HTMLButtonElement>('#q-clear');
const toast = $('#toast');
const about = $<HTMLDialogElement>('#about');

// ---------------------------------------------------------------------------------------------
// Rendering

function applyStaticText(): void {
  document.documentElement.lang = lang();
  document.title = t('title');
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = t(el.dataset.t as StringKey);
  for (const el of document.querySelectorAll<HTMLElement>('[data-t-label]')) {
    const s = t(el.dataset.tLabel as StringKey);
    el.setAttribute('aria-label', s);
    el.title = s;
  }
  input.placeholder = t('searchPlaceholder');
  input.setAttribute('aria-label', t('searchLabel'));
  clearBtn.setAttribute('aria-label', t('clearSearch'));
  $('#lang-switch').setAttribute('aria-label', t('language'));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#lang-switch button')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang()));
  $('#map').setAttribute('aria-label', t('mapLabel'));
  updateHandleLabel();
  renderAbout();
}

const poiName = (f: Feature) => prop(f.properties, 'name');
const catCount = (id: string) => state.pois.filter((f) => f.properties?.category === id).length;
const presentCats = () => {
  const seen = new Set(state.pois.map((f) => String(f.properties?.category)));
  return [...Object.keys(CATEGORIES).filter((c) => seen.has(c)), ...[...seen].filter((c) => !CATEGORIES[c])];
};

function renderBody(): void {
  const prevScroll = body.scrollTop;
  if (state.selected) body.innerHTML = detailHTML(state.selected);
  else if (state.query.trim()) body.innerHTML = resultsHTML();
  else body.innerHTML = homeHTML();
  body.dataset.view = state.selected ? 'detail' : state.query.trim() ? 'results' : 'home';
  if (!state.selected) body.scrollTop = prevScroll;
}

function homeHTML(): string {
  const cats = presentCats();
  const chip = (id: string) => {
    const on = !state.hiddenCats.has(id);
    return `<button type="button" class="chip" data-cat="${esc(id)}" aria-pressed="${on}">
      <span class="badge">${badgeSVG(id, 22)}</span><span class="chip-label">${esc(category(id).label[lang()])}</span><span class="chip-count">${catCount(id)}</span></button>`;
  };
  const toggle = (key: 'buildings' | 'labels', on: boolean) =>
    `<button type="button" class="chip chip-plain" data-toggle="${key}" aria-pressed="${on}"><span class="chip-check">${ICONS.check}</span><span class="chip-label">${esc(t(key))}</span></button>`;
  const groups = cats.map((id) => {
    const items = state.pois.filter((f) => f.properties?.category === id);
    return `<div class="group">
      <h3 class="group-title"><span class="badge">${badgeSVG(id, 18)}</span>${esc(category(id).label[lang()])}</h3>
      <ul class="list">${items.map(poiItemHTML).join('')}</ul></div>`;
  }).join('');
  return `
    <section class="section" aria-labelledby="h-layers">
      <h2 class="section-title" id="h-layers">${esc(t('layers'))}</h2>
      <div class="chips">${cats.map(chip).join('')}${toggle('buildings', state.showBuildings)}${toggle('labels', state.showLabels)}</div>
    </section>
    <section class="section" aria-labelledby="h-finds">
      <h2 class="section-title" id="h-finds">${esc(t('finds'))}</h2>
      ${groups || `<p class="muted">…</p>`}
    </section>`;
}

function poiItemHTML(f: Feature): string {
  const p = f.properties ?? {};
  const area = prop(p, 'area');
  const status = f.geometry ? '' : `<span class="item-status">${esc(t('notPinned'))}</span>`;
  return `<li><button type="button" class="item" data-poi="${esc(p.id)}">
    <span class="item-text"><span class="item-name">${esc(poiName(f))}</span>${area ? `<span class="item-sub">${esc(area)}</span>` : ''}${status}</span>
    <span class="item-go">${ICONS.chevron}</span></button></li>`;
}

function resultsHTML(): string {
  const hits = search(state.index, state.query);
  if (!hits.length) return `<p class="empty">${esc(t('noResults', { q: state.query.trim() }))}</p>`;
  return `<ul class="list results">${hits.map((e) => {
    const p = e.feature.properties ?? {};
    if (e.type === 'poi') {
      const sub = [category(p.category).label[lang()], prop(p, 'area')].filter(Boolean).join(' · ');
      return `<li><button type="button" class="item" data-poi="${esc(p.id)}"><span class="badge">${badgeSVG(p.category, 26)}</span>
        <span class="item-text"><span class="item-name">${esc(poiName(e.feature))}</span><span class="item-sub">${esc(sub)}</span>${e.feature.geometry ? '' : `<span class="item-status">${esc(t('notPinned'))}</span>`}</span></button></li>`;
    }
    const i = state.places.indexOf(e.feature);
    return `<li><button type="button" class="item" data-place="${i}"><span class="place-dot kind-${esc(p.kind)}">${ICONS.pin}</span>
      <span class="item-text"><span class="item-name">${esc(prop(p, 'name'))}</span><span class="item-sub">${esc(t(`kind_${p.kind}` as StringKey) || p.kind)}</span></span></button></li>`;
  }).join('')}</ul>`;
}

function detailHTML(id: string): string {
  const f = state.pois.find((x) => x.properties?.id === id);
  if (!f) return '';
  const p = f.properties ?? {};
  const c = category(p.category);
  const where = prop(p, 'where'), note = prop(p, 'note'), area = prop(p, 'area');
  const flags: string[] = Array.isArray(p.flags) ? p.flags : [];
  let host = '';
  const source = typeof p.source === 'string' && /^https?:\/\//.test(p.source) ? p.source : '';
  try { host = new URL(source).hostname.replace(/^www\./, ''); } catch { host = ''; }
  const r = Number(p.radius_m);
  return `
    <div class="detail">
      <button type="button" class="back" id="back">${ICONS.back}<span>${esc(t('back'))}</span></button>
      <div class="detail-head">
        <span class="badge">${badgeSVG(p.category, 40)}</span>
        <div>
          <h2 class="detail-title" id="detail-title" tabindex="-1">${esc(poiName(f))}</h2>
          <p class="detail-cat">${esc(c.label[lang()])}${area ? ` · ${esc(area)}` : ''}</p>
        </div>
      </div>
      ${flags.length ? `<ul class="flags">${flags.map((fl) => `<li class="flag">${esc(t(`flag_${fl}` as StringKey) || fl)}</li>`).join('')}</ul>` : ''}
      ${f.geometry ? '' : `<p class="notice">${ICONS.pin}<span>${esc(t('notPinned'))}</span></p>`}
      ${where ? `<h3 class="field-title">${esc(t('where'))}</h3><p class="field">${esc(where)}</p>` : ''}
      ${r > 0 ? `<p class="field muted">${esc(t('areaRadius', { r: Math.round((r * 2) / 50) * 50 }))}</p>` : ''}
      ${note ? `<h3 class="field-title">${esc(t('note'))}</h3><p class="field">${esc(note)}</p>` : ''}
      <div class="actions">
        ${f.geometry ? `<button type="button" class="btn btn-primary" id="show-on-map">${ICONS.target}<span>${esc(t('showOnMap'))}</span></button>` : ''}
        <button type="button" class="btn" id="copy-link">${ICONS.link}<span>${esc(t('copyLink'))}</span></button>
      </div>
      ${source ? `<p class="source">${esc(t('source'))}: <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(host)}</a></p>` : ''}
    </div>`;
}

function renderAbout(): void {
  about.setAttribute('aria-labelledby', 'about-title');
  about.innerHTML = `
    <form method="dialog" class="about-inner">
      <div class="about-hero">
        <span class="mark mark-lg">${ICONS.mark}</span>
        <div><h2 id="about-title">${esc(t('aboutTitle'))}</h2><p class="about-name">${esc(t('title'))}</p></div>
        <button class="icon-btn about-close" value="close" aria-label="${esc(t('close'))}" title="${esc(t('close'))}">${ICONS.close}</button>
      </div>
      <p>${esc(t('aboutIntro'))}</p>
      <p class="disclaimer">${esc(t('disclaimer')).replace('\n', '<br>')}</p>
      <h3>${esc(t('sourcesTitle'))}</h3>
      <p>${esc(t('sourcesMap'))}</p>
      <p>${esc(t('sourcesFinds'))}</p>
      <h3>${esc(t('licencesTitle'))}</h3>
      <ul class="about-list">
        <li>${esc(t('licenceCode'))}</li>
        <li>${esc(t('licenceData'))}</li>
        <li>${esc(t('licenceFonts'))}</li>
        <li>MapLibre GL JS: BSD-3-Clause</li>
      </ul>
      <a class="btn btn-primary btn-wide" href="${REPO}" target="_blank" rel="noopener noreferrer">${ICONS.github}<span>${esc(t('contribute'))}</span></a>
    </form>`;
}

// ---------------------------------------------------------------------------------------------
// Bottom sheet (phones)

const SHEET_ORDER = ['peek', 'half', 'full'] as const;

function sheetHeights() {
  const vh = window.innerHeight;
  const headH = ($('.panel-head', panel).offsetHeight || 56) + ($('.search', panel).offsetHeight || 48) + 30;
  return { peek: Math.min(headH, vh * 0.4), half: Math.round(vh * 0.5), full: vh - 64 };
}

function setSheet(s: typeof state.sheet): void {
  state.sheet = s;
  panel.dataset.sheet = s;
  if (phoneQuery.matches) panel.style.height = `${sheetHeights()[s]}px`;
  else panel.style.height = '';
  updateHandleLabel();
}

function updateHandleLabel(): void {
  const h = $('#sheet-handle');
  const label = state.sheet === 'full' ? t('collapse') : t('expand');
  h.setAttribute('aria-label', label);
  h.setAttribute('aria-expanded', String(state.sheet !== 'peek'));
}

function initSheet(): void {
  const handle = $('#sheet-handle');
  const head = $('.panel-head', panel);
  let startY = 0, startH = 0, dragging = false, moved = false;
  const down = (e: PointerEvent) => {
    if (!phoneQuery.matches || (e.target as HTMLElement).closest('button:not(#sheet-handle), input')) return;
    dragging = true; moved = false; startY = e.clientY; startH = panel.offsetHeight;
    panel.classList.add('dragging');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    const hs = sheetHeights();
    panel.style.height = `${Math.min(Math.max(startH + dy, hs.peek), hs.full)}px`;
  };
  const up = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('dragging');
    if (!moved) return;
    const h = panel.offsetHeight, hs = sheetHeights();
    const v = startY - e.clientY;
    let best = SHEET_ORDER.reduce((a, b) => (Math.abs(hs[b] - h) < Math.abs(hs[a] - h) ? b : a));
    if (Math.abs(v) > 40) {
      const i = SHEET_ORDER.indexOf(best);
      if (v > 0 && hs[best] < h) best = SHEET_ORDER[Math.min(i + 1, 2)];
      if (v < 0 && hs[best] > h) best = SHEET_ORDER[Math.max(i - 1, 0)];
    }
    setSheet(best);
  };
  for (const el of [handle, head]) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  handle.addEventListener('click', () => { if (!moved) setSheet(state.sheet === 'peek' ? 'half' : state.sheet === 'half' ? 'full' : 'peek'); });
  phoneQuery.addEventListener('change', () => setSheet(state.sheet));
  window.addEventListener('resize', () => setSheet(state.sheet));
}

// ---------------------------------------------------------------------------------------------
// Map

function viewPadding(): maplibregl.PaddingOptions {
  if (phoneQuery.matches) {
    const bottom = state.sheet === 'peek' ? panel.offsetHeight : sheetHeights().half;
    return { top: 64, bottom: bottom + 16, left: 16, right: 16 };
  }
  const left = panel.getBoundingClientRect().right;
  return { top: 40, bottom: 40, left: left + 24, right: 72 };
}

function fitLeonida(animate = true): void {
  map?.fitBounds(state.landBBox as LngLatBoundsLike, { padding: viewPadding(), bearing: 0, pitch: 0, animate: animate && !reducedMotion.matches, duration: 800 });
}

const PLACE_ZOOM: Record<string, number> = { state: 11, county: 12.2, city: 13, water: 12, town: 13.8, island: 14.2, airport: 14.2, district: 14.6, landmark: 15.6 };

function flyTo(center: [number, number], zoom: number): void {
  if (!map) return;
  map.flyTo({ center, zoom, padding: viewPadding(), duration: 1200, essential: false, curve: 1.3 });
}

function selectPoi(id: string | null, opts: { fly?: boolean; focus?: boolean } = {}): void {
  const prev = state.selected;
  state.selected = id;
  if (map && mapReady) {
    if (prev) map.setFeatureState({ source: 'poi-area', id: prev }, { selected: false });
    if (id) map.setFeatureState({ source: 'poi-area', id }, { selected: true });
    const f = id ? state.pois.find((x) => x.properties?.id === id) : null;
    (map.getSource('selection') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: f?.geometry ? [{ type: 'Feature', properties: { category: f.properties?.category }, geometry: f.geometry }] : [] });
  }
  if (id && phoneQuery.matches && state.sheet === 'peek') setSheet('half');
  renderBody();
  updateHash();
  const f = id ? state.pois.find((x) => x.properties?.id === id) : null;
  if (id && f?.geometry && opts.fly !== false) focusPoi(f);
  if (opts.focus) $('#detail-title')?.focus({ preventScroll: true });
}

function focusPoi(f: Feature): void {
  if (f.geometry?.type !== 'Point' || !map) return;
  const r = Number(f.properties?.radius_m) || 0;
  const z = r > 700 ? 13.8 : r > 250 ? 14.6 : r > 0 ? 15.3 : 15.6;
  flyTo(f.geometry.coordinates as [number, number], Math.max(z, Math.min(map.getZoom(), 17)));
}

function applyLabelLanguage(): void {
  if (!map || !mapReady) return;
  for (const [id, sp] of Object.entries(LABEL_LAYERS)) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, 'text-field', nameField(lang()));
    map.setLayoutProperty(id, 'text-letter-spacing', spacing(lang(), sp));
  }
}

function applyLayerVisibility(): void {
  if (!map || !mapReady) return;
  const vis = (on: boolean) => (on ? 'visible' : 'none');
  const pitched = map.getPitch() > 8;
  map.setLayoutProperty('building', 'visibility', vis(state.showBuildings && !pitched));
  map.setLayoutProperty('building-3d', 'visibility', vis(state.showBuildings && pitched));
  for (const id of Object.keys(LABEL_LAYERS).filter((x) => x.startsWith('label-') || x === 'road-name' || x === 'poi-label')) {
    map.setLayoutProperty(id, 'visibility', vis(state.showLabels));
  }
  map.setLayoutProperty('road-shield', 'visibility', vis(state.showLabels));
  const hidden = [...state.hiddenCats];
  const catFilter: maplibregl.FilterSpecification = ['!', ['in', ['get', 'category'], ['literal', hidden]]];
  for (const id of ['poi', 'poi-label', 'poi-area', 'poi-area-line']) map.setFilter(id, catFilter);
}

/** Map labels in Chinese are drawn locally with Noto Sans; make sure the needed slices are loaded first. */
const CJK_CSS: Record<string, () => Promise<unknown>> = {
  'zh-Hans': () => import('./fonts-sc.css'),
  'zh-Hant': () => import('./fonts-tc.css'),
};

async function ensureCjkFonts(l: Lang): Promise<void> {
  if (l === 'en') return;
  await CJK_CSS[l]().catch(() => undefined);
  if (!document.fonts) return;
  const text = [...state.places, ...state.pois].map((f) => prop(f.properties, 'name', l)).join('');
  const cjk = [...new Set(text.match(/[⺀-鿿豈-﫿　-〿＀-￯]/g) ?? [])].join('');
  if (!cjk) return;
  const fam = l === 'zh-Hant' ? 'Noto Sans TC' : 'Noto Sans SC';
  const loads = ['400', '500', '700'].map((w) => document.fonts.load(`${w} 16px "${fam}"`, cjk));
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 4000))]);
}

async function changeLang(l: Lang): Promise<void> {
  if (l === lang()) return;
  setLang(l);
  saveLang(l);
  applyStaticText();
  renderBody();
  await ensureCjkFonts(l);
  applyLabelLanguage();
}

let hashTimer = 0;
function updateHash(): void {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    if (!map) return;
    const c = map.getCenter();
    writeHash({ zoom: map.getZoom(), lat: c.lat, lng: c.lng, bearing: map.getBearing(), pitch: map.getPitch(), poi: state.selected });
  }, 250);
}

function updateCompass(): void {
  if (!map) return;
  const b = map.getBearing();
  $('.needle').style.transform = `rotate(${-b}deg)`;
  $('#tilt').setAttribute('aria-pressed', String(map.getPitch() > 8));
  $('#compass').classList.toggle('rotated', Math.abs(b) > 0.5);
}

function showToast(msg: string): void {
  toast.textContent = msg;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------------------------------------
// Events

function bindUI(): void {
  $('#lang-switch').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-lang]');
    if (b) void changeLang(b.dataset.lang as Lang);
  });
  const openAbout = () => { about.showModal(); };
  for (const id of ['#about-btn', '#about-link', '#credit-about']) $(id).addEventListener('click', openAbout);
  about.addEventListener('click', (e) => { if (e.target === about) about.close(); });

  input.addEventListener('input', () => {
    state.query = input.value;
    clearBtn.hidden = !input.value;
    if (state.selected) { state.selected = null; selectPoi(null, { fly: false }); }
    renderBody();
    body.scrollTop = 0;
  });
  input.addEventListener('focus', () => { if (phoneQuery.matches && state.sheet === 'peek') setSheet('full'); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); body.querySelector<HTMLButtonElement>('.item')?.click(); }
    if (e.key === 'Escape' && input.value) { e.stopPropagation(); clearSearch(); }
  });
  clearBtn.addEventListener('click', () => { clearSearch(); input.focus(); });

  body.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const chip = el.closest<HTMLButtonElement>('[data-cat]');
    if (chip) {
      const c = chip.dataset.cat!;
      if (state.hiddenCats.has(c)) state.hiddenCats.delete(c); else state.hiddenCats.add(c);
      chip.setAttribute('aria-pressed', String(!state.hiddenCats.has(c)));
      applyLayerVisibility();
      return;
    }
    const tog = el.closest<HTMLButtonElement>('[data-toggle]');
    if (tog) {
      if (tog.dataset.toggle === 'buildings') state.showBuildings = !state.showBuildings;
      else state.showLabels = !state.showLabels;
      tog.setAttribute('aria-pressed', String(tog.dataset.toggle === 'buildings' ? state.showBuildings : state.showLabels));
      applyLayerVisibility();
      return;
    }
    const poi = el.closest<HTMLButtonElement>('[data-poi]');
    if (poi) { selectPoi(poi.dataset.poi!, { focus: true }); return; }
    const place = el.closest<HTMLButtonElement>('[data-place]');
    if (place) {
      const f = state.places[Number(place.dataset.place)];
      if (f?.geometry?.type === 'Point') {
        if (phoneQuery.matches) { input.blur(); setSheet('peek'); }
        flyTo(f.geometry.coordinates as [number, number], PLACE_ZOOM[f.properties?.kind] ?? 13.5);
      }
      return;
    }
    if (el.closest('#back')) { selectPoi(null); (state.query ? input : body).focus(); return; }
    if (el.closest('#show-on-map')) {
      const f = state.pois.find((x) => x.properties?.id === state.selected);
      if (f) { if (phoneQuery.matches) setSheet('peek'); focusPoi(f); }
      return;
    }
    if (el.closest('#copy-link')) {
      updateHash();
      window.setTimeout(() => {
        navigator.clipboard?.writeText(location.href).then(() => showToast(t('copied')), () => showToast(location.href));
      }, 300);
    }
  });

  $('#zoom-in').addEventListener('click', () => map?.zoomIn());
  $('#zoom-out').addEventListener('click', () => map?.zoomOut());
  $('#compass').addEventListener('click', () => map?.easeTo({ bearing: 0, pitch: map.getPitch() > 8 ? map.getPitch() : 0 }));
  $('#tilt').addEventListener('click', () => map?.easeTo({ pitch: map.getPitch() > 8 ? 0 : 58, zoom: map.getPitch() > 8 ? map.getZoom() : Math.max(map.getZoom(), 14.5) }));
  $('#fit').addEventListener('click', () => fitLeonida());

  document.addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
    if (e.key === '/' && !typing && !about.open) { e.preventDefault(); input.focus(); input.select(); }
    if (e.key === 'Escape' && !about.open && state.selected) selectPoi(null);
  });
  window.addEventListener('hashchange', () => {
    const h = readHash();
    if (h.poi !== state.selected) selectPoi(h.poi, { fly: !h.view });
    if (h.view && map) map.jumpTo({ center: [h.view.lng, h.view.lat], zoom: h.view.zoom, bearing: h.view.bearing, pitch: h.view.pitch });
  });
}

function clearSearch(): void {
  input.value = '';
  state.query = '';
  clearBtn.hidden = true;
  renderBody();
}

// ---------------------------------------------------------------------------------------------
// Boot

async function boot(): Promise<void> {
  if (lang() !== 'en') void CJK_CSS[lang()]();
  applyStaticText();
  renderBody();
  initSheet();
  setSheet(phoneQuery.matches ? 'peek' : 'full');
  bindUI();

  const loads = {
    land: fetchLayer('land'), landuse: fetchLayer('landuse'), buildings: fetchLayer('buildings'),
    roads: fetchLayer('roads'), places: fetchLayer('places'), poi: fetchLayer('poi'),
  };
  let failed = false;
  const fail = (e: unknown) => { console.error(e); if (!failed) { failed = true; showToast(t('loadError')); } return null; };

  const [land, places, pois] = await Promise.all([loads.land.catch(fail), loads.places.catch(fail), loads.poi.catch(fail), prepareImages()]);
  state.places = places?.features ?? [];
  state.pois = pois?.features ?? [];
  state.index = buildIndex(state.places, state.pois);
  const bb = land && bboxOf(land);
  if (bb) state.landBBox = bb;
  renderBody();

  await ensureCjkFonts(lang());

  const hash = readHash();
  // Generous and square, so a wide desktop window can still see the whole state at once.
  const [w0, s0, e0, n0] = state.landBBox;
  const half = Math.max(e0 - w0, n0 - s0) * 1.2;
  const cx = (w0 + e0) / 2, cy = (s0 + n0) / 2;
  const maxBounds: BBox = [cx - half, cy - half, cx + half, cy + half];
  let m: MLMap;
  try {
    m = new maplibregl.Map({
      container: 'map',
      style: buildStyle(`${location.origin}${import.meta.env.BASE_URL}glyphs/{fontstack}/{range}.pbf`, lang()),
      bounds: state.landBBox as LngLatBoundsLike,
      fitBoundsOptions: { padding: viewPadding() },
      maxBounds: maxBounds as LngLatBoundsLike,
      minZoom: 9.5,
      maxZoom: 18.5,
      maxPitch: 70,
      attributionControl: false,
      localIdeographFontFamily: CJK_FONTS,
      fadeDuration: reducedMotion.matches ? 0 : 250,
      cancelPendingTileRequestsWhileZooming: false,
    });
  } catch (e) {
    console.error(e);
    $('#map').innerHTML = `<p class="map-error">${esc(t('webglError'))}</p>`;
    return;
  }
  map = m;
  if (hash.view) m.jumpTo({ center: [hash.view.lng, hash.view.lat], zoom: hash.view.zoom, bearing: hash.view.bearing, pitch: hash.view.pitch });

  m.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
  m.keyboard.enable();
  addImages(map);

  m.on('load', () => {
    mapReady = true;
    const setData = (id: string, fc: FC | null) => fc && (m.getSource(id) as maplibregl.GeoJSONSource).setData(fc as GeoJSON.FeatureCollection);
    setData('land', land as FC);
    setData('places', places as FC);
    if (pois) { setData('poi', pinned(pois)); setData('poi-area', searchAreas(pois)); }
    loads.landuse.then((fc) => setData('landuse', fc), fail);
    loads.roads.then((fc) => setData('roads', fc), fail);
    loads.buildings.then((fc) => setData('buildings', withHeights(fc)), fail);
    applyLayerVisibility();
    if (hash.poi) selectPoi(hash.poi, { fly: !hash.view });
    updateCompass();
    document.body.classList.add('ready');
  });

  m.on('move', updateCompass);
  m.on('moveend', updateHash);
  m.on('pitchend', applyLayerVisibility);
  m.on('click', 'poi', (e) => {
    const id = e.features?.[0]?.properties?.id;
    if (id) selectPoi(String(id), { fly: false });
  });
  m.on('click', (e) => {
    if (!state.selected) return;
    const hit = m.queryRenderedFeatures(e.point, { layers: ['poi'] });
    if (!hit.length) selectPoi(null);
  });
  m.on('mouseenter', 'poi', () => { m.getCanvas().style.cursor = 'pointer'; });
  m.on('mouseleave', 'poi', () => { m.getCanvas().style.cursor = ''; });
}

void boot();

// Handle for poking at the map from the console during development.
if (import.meta.env.DEV) (window as any).__leonida = { get map() { return map; }, state };
