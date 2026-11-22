import * as maplibregl from 'maplibre-gl';
import { startPrefetch } from './prefetch';
import type { Map as MLMap, LngLatBoundsLike } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './fonts.css';
import './styles.css';

import { detectLang, saveLang, setLang, lang, t, prop, LANGS, LANG_SHORT, LANG_NAME, type Lang, type StringKey } from './i18n';
import { buildStyle, nameField, spacing, LABEL_LAYERS, TILE_SIZE } from './style';
import { prepareImages, addImages } from './images';
import { fetchLayer, pinned, searchAreas, type FC, type Feature } from './data';
import { ROUGH_BOUNDS, GAME_SCALE, type BBox } from './geo';

/** A scale bar in game metres (the map's web-mercator metres differ by GAME_SCALE). Updates once per frame. */
class GameScale implements maplibregl.IControl {
  private el = document.createElement('div');
  private map?: MLMap;
  private raf = 0;
  onAdd(map: MLMap) {
    this.map = map;
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-scale';
    map.on('move', this.schedule);
    this.update();
    return this.el;
  }
  onRemove() { this.map?.off('move', this.schedule); this.el.remove(); }
  private schedule = () => { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.update(); }); };
  private update() {
    const m = this.map!;
    const lat = m.getCenter().lat * Math.PI / 180;
    const mPerPx = 40075016.686 * Math.cos(lat) / (512 * 2 ** m.getZoom()) / GAME_SCALE;
    const max = 110 * mPerPx;
    const pow = 10 ** Math.floor(Math.log10(max));
    const d = max / pow;
    const nice = (d >= 5 ? 5 : d >= 2 ? 2 : 1) * pow;
    this.el.style.width = `${Math.round(nice / mPerPx)}px`;
    this.el.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
  }
}
import { CATEGORIES, category, badgeSVG, blipSVG, LANDMARK_GROUPS, landmarkGroup } from './categories';
import { buildIndex, search, type Entry } from './search';
import { readHash, writeHash } from './hash';
import { ICONS } from './ui-icons';

maplibregl.setWorkerUrl(workerUrl);

const REPO = 'https://github.com/enkerewpo/leonida-online-map';
const X_URL = 'https://x.com/wheat_fox';
const TILES_URL = 'https://map.gtadb.org';
// System CJK fonts first (no download, available at once on Apple and Windows), then the webfonts.
const CJK_FONTS = '"Black","PingFang SC","PingFang TC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Noto Sans TC",sans-serif';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phoneQuery = matchMedia('(max-width: 760px)');

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

// ---------------------------------------------------------------------------------------------
// State

setLang(detectLang());

const state = {
  places: [] as Feature[],
  pois: [] as Feature[],
  landmarks: [] as Feature[],
  index: [] as Entry[],
  landBBox: ROUGH_BOUNDS as BBox,
  selected: null as string | null,
  query: '',
  hiddenCats: new Set<string>(),
  hiddenGroups: new Set<string>(),
  /** Single landmark categories switched off in the legend. */
  hiddenLmCats: new Set<string>(),
  showLabels: true,
  sheet: 'peek' as 'peek' | 'half' | 'full',
  tab: 'finds' as 'finds' | 'layers',
};

let map: MLMap | null = null;
let mapReady = false;

// ---------------------------------------------------------------------------------------------
// Static DOM

const app = $('#app');
const hint = (id: string, key: StringKey, icon: string, extra = '') =>
  `<button type="button" class="hint" id="${id}" data-t-label="${key}" ${extra}><span class="hint-label" data-t="${key}"></span><span class="hint-key">${icon}</span></button>`;

app.innerHTML = `
  <div id="map" class="map"></div>
  <section id="panel" class="panel" data-sheet="peek">
    <button class="sheet-handle" id="sheet-handle" type="button"><span></span></button>
    <header class="panel-head">
      <div class="brand">
        <h1 class="wordmark"><span class="wordmark-main">Leonida</span><span class="wordmark-sub" data-t="mapName"></span></h1>
      </div>
      <div class="head-actions">
        <div class="lang" id="lang">
          <button type="button" class="lang-btn" id="lang-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="lang-list">
            ${ICONS.globe}<span class="lang-name"></span><span class="lang-short"></span><span class="lang-caret">${ICONS.caret}</span>
          </button>
          <ul class="lang-list" id="lang-list" role="listbox" tabindex="-1" hidden>
            ${LANGS.map((l) => `<li role="option" id="lang-${l}" data-lang="${l}" lang="${l}" aria-selected="false"><span>${LANG_NAME[l]}</span><span class="radio" aria-hidden="true"></span></li>`).join('')}
          </ul>
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
      <a class="foot-cta" href="${REPO}" target="_blank" rel="noopener noreferrer">${ICONS.github}<span data-t="contribute"></span></a>
      <a class="icon-btn" href="${X_URL}" target="_blank" rel="noopener noreferrer" data-t-label="followX">${ICONS.x}</a>
      <button type="button" class="icon-btn" id="about-link" data-t-label="about">${ICONS.info}</button>
    </footer>
  </section>
  <div class="map-controls" id="controls">
    ${hint('zoom-in', 'zoomIn', ICONS.plus)}
    ${hint('zoom-out', 'zoomOut', ICONS.minus)}
    ${hint('compass', 'resetNorth', `<span class="needle">${ICONS.compass}</span>`)}
    ${hint('tilt', 'tilt', ICONS.cube, 'aria-pressed="false"')}
    ${hint('legend-btn', 'legend', ICONS.legend)}
    ${hint('fit', 'fit', ICONS.fit)}
  </div>
  <div class="map-credit" id="credit">
    <a href="${TILES_URL}" target="_blank" rel="noopener noreferrer" data-t="credit"></a>
    <button type="button" class="link-btn" id="credit-about" data-t="about"></button>
  </div>
  <div class="loading" aria-hidden="true"><span class="ring"></span><span data-t="loading"></span></div>
  <div class="ctx-ring" id="ctx-ring" hidden></div>
  <div class="ctx" id="ctx" role="menu" hidden>
    <p class="ctx-coords" id="ctx-coords"></p>
    <a class="ctx-item" role="menuitem" id="ctx-fix" target="_blank" rel="noopener noreferrer">${ICONS.github}<span data-t="addOrFix"></span></a>
    <button type="button" class="ctx-item" role="menuitem" id="ctx-copy">${ICONS.link}<span data-t="copyCoords"></span></button>
  </div>
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
  const langBtn = $('#lang-btn');
  langBtn.setAttribute('aria-label', `${t('language')}: ${LANG_NAME[lang()]}`);
  $('.lang-name', langBtn).textContent = LANG_NAME[lang()];
  $('.lang-short', langBtn).textContent = LANG_SHORT[lang()];
  $('#lang-list').setAttribute('aria-label', t('language'));
  for (const o of document.querySelectorAll<HTMLElement>('#lang-list [role=option]')) o.setAttribute('aria-selected', String(o.dataset.lang === lang()));
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

let lastView = '';

function renderBody(): void {
  const prevScroll = body.scrollTop;
  if (state.selected) body.innerHTML = detailHTML(state.selected);
  else if (state.query.trim()) body.innerHTML = resultsHTML();
  else body.innerHTML = homeHTML();
  const view = state.selected ? `detail:${state.selected}` : state.query.trim() ? 'results' : `home:${state.tab}`;
  body.dataset.view = view.split(':')[0];
  // A new screen fades in once; re-renders of the same screen (language, filters) stay still.
  if (view !== lastView && lastView !== '') {
    body.classList.remove('swap');
    void body.offsetWidth;
    body.classList.add('swap');
  }
  if (view.startsWith('home') && lastView !== view) body.scrollTop = 0;
  else if (!state.selected) body.scrollTop = prevScroll;
  lastView = view;
}

function homeHTML(): string {
  const cats = presentCats();
  const check = `<span class="check" aria-hidden="true">${ICONS.check}</span>`;
  const row = (attr: string, on: boolean, lead: string, label: string, count = '') =>
    `<li><button type="button" class="row" ${attr} aria-pressed="${on}">${lead}<span class="row-label">${esc(label)}</span>${count}${check}</button></li>`;
  const layers = `
    <div class="legend-actions">
      <button type="button" class="btn btn-small" data-all="show">${esc(t('showAllCats'))}</button>
      <button type="button" class="btn btn-small" data-all="hide">${esc(t('hideAllCats'))}</button>
    </div>
    <section class="section" aria-labelledby="h-cats">
      <h2 class="section-title" id="h-cats">${esc(t('finds'))}</h2>
      <ul class="rows">${cats.map((id) => row(`data-cat="${esc(id)}"`, !state.hiddenCats.has(id),
        `<span class="badge">${badgeSVG(id, 22)}</span>`, category(id).label[lang()], `<span class="row-count">${catCount(id)}</span>`)).join('')}</ul>
    </section>
    <section class="section" aria-labelledby="h-places">
      <h2 class="section-title" id="h-places">${esc(t('placesTitle'))}</h2>
      <ul class="rows">
        ${LANDMARK_GROUPS.map((g) => {
          const inGroup = (c: string) => state.landmarks.filter((f) => String(f.properties?.category) === c).length;
          const sub = g.cats.filter((c) => inGroup(c) > 0).map((c) => row(`data-lmcat="${esc(c)}" data-in="${g.id}"`, !state.hiddenGroups.has(g.id) && !state.hiddenLmCats.has(c),
            `<span class="badge">${blipSVG(c, 18)}</span>`, category(c).label[lang()], `<span class="row-count">${inGroup(c)}</span>`).replace('<li>', '<li class="sub">')).join('');
          return row(`data-group="${g.id}"`, !state.hiddenGroups.has(g.id), `<span class="badge">${blipSVG(g.icon, 22)}</span>`, g.label[lang()],
            `<span class="row-count">${state.landmarks.filter((f) => landmarkGroup(String(f.properties?.category)) === g.id).length}</span>`) + sub;
        }).join('')}
        ${row('data-toggle="labels"', state.showLabels, `<span class="swatch swatch-text">A</span>`, t('labels'))}
      </ul>
    </section>`;
  const groups = cats.map((id) => {
    const items = state.pois.filter((f) => f.properties?.category === id);
    return `<div class="group">
      <h3 class="group-title"><span class="badge">${badgeSVG(id, 18)}</span><span>${esc(category(id).label[lang()])}</span><span class="row-count">${items.length}</span></h3>
      <ul class="list">${items.map(poiItemHTML).join('')}</ul></div>`;
  }).join('');
  const finds = groups || `<p class="empty">…</p>`;
  const tab = (id: 'finds' | 'layers', key: StringKey) =>
    `<button type="button" role="tab" class="tab" id="tab-${id}" data-tab="${id}" aria-controls="tabpanel" aria-selected="${state.tab === id}" tabindex="${state.tab === id ? 0 : -1}">${esc(t(key))}</button>`;
  return `
    <div class="tabs" role="tablist">${tab('finds', 'finds')}${tab('layers', 'layers')}</div>
    <div class="tabpanel" id="tabpanel" role="tabpanel" aria-labelledby="tab-${state.tab}">${state.tab === 'finds' ? finds : layers}</div>`;
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
  // The same name can come from the official map's labels and from a landmark; list it once.
  const seen = new Set<string>();
  const hits = search(state.index, state.query).filter((e) => {
    const key = e.type === 'poi' ? poiName(e.feature) : prop(e.feature.properties ?? {}, 'name');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/** A find or a landmark by id (they share the `poi=` hash key and the detail card). */
const byId = (id: string | null) => (id ? state.pois.find((x) => x.properties?.id === id) ?? state.landmarks.find((x) => x.properties?.id === id) ?? null : null);

/** A prefilled "Map correction" issue for one find or landmark. */
function fixUrl(id: string, f: Feature): string {
  const p = f.properties ?? {};
  const link = `${location.origin}${location.pathname}#poi=${encodeURIComponent(id)}`;
  const q = new URLSearchParams({ template: 'map-correction.yml', title: `Fix: ${p.name ?? id}`, link, what: `Item: ${p.name ?? ''} (${id})\n\n` });
  return `${REPO}/issues/new?${q}`;
}

function detailHTML(id: string): string {
  const f = byId(id);
  if (!f) return '';
  const p = f.properties ?? {};
  const c = category(p.category);
  const where = prop(p, 'where'), note = prop(p, 'note'), area = prop(p, 'area');
  const flags: string[] = Array.isArray(p.flags) ? [...p.flags] : [];
  if (p.enterable === true) flags.push('enterable');
  if (p.unconfirmed === true) flags.push('unconfirmed');
  let host = '';
  const source = typeof p.source === 'string' && /^https?:\/\//.test(p.source) ? p.source : '';
  try { host = new URL(source).hostname.replace(/^www\./, ''); } catch { host = ''; }
  const r = Number(p.radius_m);
  return `
    <div class="detail">
      <button type="button" class="back" id="back">${ICONS.back}<span>${esc(t('back'))}</span></button>
      <div class="detail-head">
        <span class="badge">${badgeSVG(p.category, 40)}</span>
        <div class="detail-titles">
          <p class="detail-cat">${esc(c.label[lang()])}${area ? `<span class="sep"></span>${esc(area)}` : ''}</p>
          <h2 class="detail-title" id="detail-title" tabindex="-1">${esc(poiName(f))}</h2>
        </div>
      </div>
      <hr class="rule" />
      ${flags.length ? `<ul class="flags">${flags.map((fl) => `<li class="flag">${esc(t(`flag_${fl}` as StringKey) || fl)}</li>`).join('')}</ul>` : ''}
      ${f.geometry ? '' : `<p class="notice">${ICONS.pin}<span>${esc(t('notPinned'))}</span></p>`}
      ${where ? `<h3 class="field-title">${esc(t('where'))}</h3><p class="field">${esc(where)}</p>` : ''}
      ${r > 0 ? `<p class="field muted">${esc(t('areaRadius', { r: Math.round((r * 2) / 50) * 50 }))}</p>` : ''}
      ${note ? `<h3 class="field-title">${esc(t('note'))}</h3><p class="field">${esc(note)}</p>` : ''}
      <div class="actions">
        ${f.geometry ? `<button type="button" class="btn btn-primary" id="show-on-map">${ICONS.target}<span>${esc(t('showOnMap'))}</span></button>` : ''}
        <button type="button" class="btn" id="copy-link">${ICONS.link}<span>${esc(t('copyLink'))}</span></button>
        <a class="btn" id="fix-item" href="${esc(fixUrl(id, f))}" target="_blank" rel="noopener noreferrer">${ICONS.github}<span>${esc(t('fixThis'))}</span></a>
      </div>
      ${source ? `<p class="source">${esc(t('source'))}: <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(host)}</a></p>` : ''}
    </div>`;
}

function renderAbout(): void {
  about.setAttribute('aria-labelledby', 'about-title');
  const ext = (href: string, icon: string, label: string, sub: string) =>
    `<li><a class="about-link" href="${href}" target="_blank" rel="noopener noreferrer">${icon}<span class="about-link-text"><span>${esc(label)}</span><span class="about-link-sub">${esc(sub)}</span></span>${ICONS.chevron}</a></li>`;
  about.innerHTML = `
    <form method="dialog" class="about-inner">
      <div class="about-hero">
        <div>
          <p class="about-kicker">${esc(t('title'))}</p>
          <h2 id="about-title">${esc(t('aboutTitle'))}</h2>
        </div>
        <button class="icon-btn about-close" value="close" aria-label="${esc(t('close'))}" title="${esc(t('close'))}">${ICONS.close}</button>
      </div>
      <hr class="rule" />
      <p>${esc(t('aboutIntro'))}</p>
      <h3>${esc(t('helpTitle'))}</h3>
      <ol class="about-steps">
        <li>${esc(t('help1'))}</li>
        <li>${esc(t('help2'))}</li>
        <li>${esc(t('help3'))} <a href="${esc(t('handbookUrl'))}" target="_blank" rel="noopener noreferrer">${esc(t('handbook'))}</a></li>
      </ol>
      <h3>${esc(t('linksTitle'))}</h3>
      <ul class="about-links">
        ${ext(REPO, ICONS.github, t('sourceCode'), 'enkerewpo/leonida-online-map')}
        ${ext(X_URL, ICONS.x, t('followX'), 'x.com/wheat_fox')}
      </ul>
      <h3>${esc(t('sourcesTitle'))}</h3>
      <p>${esc(t('sourcesMap'))}</p>
      <p>${esc(t('sourcesFinds'))}</p>
      <p class="about-credit"><a href="${TILES_URL}" target="_blank" rel="noopener noreferrer">${esc(t('credit'))}</a></p>
      <h3>${esc(t('licencesTitle'))}</h3>
      <ul class="about-list">
        <li>${esc(t('licenceCode'))}</li>
        <li>${esc(t('licenceData'))}</li>
        <li>${esc(t('licenceFonts'))}</li>
        <li>${esc(t('licenceMapLibre'))}</li>
      </ul>
      <p class="disclaimer">${esc(t('disclaimer'))}</p>
      <a class="btn btn-primary btn-wide" href="${REPO}" target="_blank" rel="noopener noreferrer">${ICONS.github}<span>${esc(t('contribute'))}</span></a>
    </form>`;
}

// ---------------------------------------------------------------------------------------------
// Bottom sheet (phones)

const SHEET_ORDER = ['peek', 'half', 'full'] as const;

function sheetHeights() {
  // The visual viewport shrinks when the on-screen keyboard opens; the sheet must fit what is visible.
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const headH = ($('.panel-head', panel).offsetHeight || 56) + ($('.search', panel).offsetHeight || 48) + 30;
  return { peek: Math.min(headH, vh * 0.4), half: Math.round(vh * 0.5), full: vh - 64 };
}

/** Keeps the sheet sitting on top of the on-screen keyboard (iOS Safari only shrinks the visual viewport). */
function fitSheetToKeyboard(): void {
  const vv = window.visualViewport;
  if (!vv || !phoneQuery.matches) { panel.style.bottom = ''; return; }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  panel.style.bottom = inset > 40 ? `${inset}px` : '';
  // The page itself never scrolls; undo any scroll Safari does to reveal the focused field.
  if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
  panel.style.height = `${sheetHeights()[state.sheet]}px`;
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
    const bottom = sheetHeights()[state.sheet === 'full' ? 'half' : state.sheet];
    return { top: 64, bottom: bottom + 16, left: 16, right: 16 };
  }
  const left = panel.getBoundingClientRect().right;
  return { top: 40, bottom: 40, left: left + 24, right: 72 };
}

/** Keeps the state on screen, measured against the part of the map not covered by the side panel or sheet: when
 * the whole state fits, it sits in the middle of that part instead of the middle of the window. */
function constrainToLeonida(b: BBox, center: maplibregl.LngLat, zoom: number): { center: maplibregl.LngLat; zoom: number } {
  zoom = Math.min(17, Math.max(10, zoom));
  if (!map) return { center, zoom };
  const ws = 512 * 2 ** zoom;
  const { width: W, height: H } = map.getContainer().getBoundingClientRect();
  const z0 = { top: 0, bottom: 0, left: 0, right: 0 };
  const p = { ...z0, ...map.getPadding() }, v = { ...z0, ...viewPadding() };
  const c = maplibregl.MercatorCoordinate.fromLngLat(center);
  const nw = maplibregl.MercatorCoordinate.fromLngLat([b[0], b[3]]), se = maplibregl.MercatorCoordinate.fromLngLat([b[2], b[1]]);
  const axis = (pos: number, lo: number, hi: number, anchor: number, b0: number, b1: number) =>
    hi - lo >= b1 - b0 ? (b0 + b1) / 2 - ((lo + hi) / 2 - anchor) : Math.min(b1 - (hi - anchor), Math.max(b0 + (anchor - lo), pos));
  const x = axis(c.x * ws, v.left, W - v.right, p.left + (W - p.left - p.right) / 2, nw.x * ws, se.x * ws);
  const y = axis(c.y * ws, v.top, H - v.bottom, p.top + (H - p.top - p.bottom) / 2, nw.y * ws, se.y * ws);
  return { center: new maplibregl.MercatorCoordinate(x / ws, y / ws).toLngLat(), zoom };
}

function fitLeonida(animate = true): void {
  // flyTo leaves its padding on the map, and fitBounds adds its own on top: clear it first, or the state ends up
  // squeezed into a corner.
  map?.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map?.fitBounds(state.landBBox as LngLatBoundsLike, { padding: viewPadding(), bearing: 0, pitch: 0, animate: animate && !reducedMotion.matches, duration: 900, easing: settle });
}

const PLACE_ZOOM: Record<string, number> = { state: 11, county: 12.2, city: 13, water: 12, town: 13.8, island: 14.2, airport: 14.2, district: 14.6, landmark: 15.6 };

/** Fast start, long settle: the curve the Leonida site uses for its own motion (cubic-bezier(.32,.72,0,1)). */
const settle = (x: number) => 1 - Math.pow(1 - x, 4);

function flyTo(center: [number, number], zoom: number): void {
  if (!map) return;
  map.flyTo({ center, zoom, padding: viewPadding(), duration: 1100, curve: 1.25, easing: settle, essential: false });
}

function selectPoi(id: string | null, opts: { fly?: boolean; focus?: boolean } = {}): void {
  const prev = state.selected;
  state.selected = id;
  if (map && mapReady) {
    if (prev) map.setFeatureState({ source: 'poi-area', id: prev }, { selected: false });
    if (id) map.setFeatureState({ source: 'poi-area', id }, { selected: true });
    const f = byId(id);
    (map.getSource('selection') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: f?.geometry ? [{ type: 'Feature', properties: { category: f.properties?.category }, geometry: f.geometry }] : [] });
    pulse(Boolean(f?.geometry));
  }
  if (id && phoneQuery.matches && state.sheet === 'peek') setSheet('half');
  renderBody();
  updateHash();
  const f = byId(id);
  if (id && f?.geometry && opts.fly !== false) focusPoi(f);
  if (opts.focus) $('#detail-title')?.focus({ preventScroll: true });
}

/** The selected blip sends out a slow ring, as mission blips do on the in-game map. */
let pulseFrame = 0;
function pulse(on: boolean): void {
  cancelAnimationFrame(pulseFrame);
  const m = map;
  if (!m || !m.getLayer('poi-pulse')) return;
  m.setPaintProperty('poi-pulse', 'circle-stroke-opacity', 0);
  if (!on || reducedMotion.matches) return;
  const t0 = performance.now();
  const step = (now: number) => {
    // Three rings, then rest, so a selection does not keep the GPU busy.
    if (now - t0 > 5400) { m.setPaintProperty('poi-pulse', 'circle-stroke-opacity', 0); return; }
    const k = ((now - t0) % 1800) / 1800;
    const e = 1 - Math.pow(1 - k, 3);
    m.setPaintProperty('poi-pulse', 'circle-radius', 20 + e * 16);
    m.setPaintProperty('poi-pulse', 'circle-stroke-opacity', 0.85 * (1 - e));
    pulseFrame = requestAnimationFrame(step);
  };
  pulseFrame = requestAnimationFrame(step);
}

function focusPoi(f: Feature): void {
  if (f.geometry?.type !== 'Point' || !map) return;
  const r = Number(f.properties?.radius_m) || 0;
  const mz = Number(f.properties?.minzoom);
  // Landmarks: close enough that their own icon is on the map.
  const z = mz > 0 ? Math.min(mz + 0.4, 19) : r > 700 ? 13.8 : r > 250 ? 14.6 : r > 0 ? 15.3 : 15.6;
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
  const m = map;
  const set = (id: string, on: boolean) => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis(on)); };
  for (const id of Object.keys(LABEL_LAYERS).filter((x) => x.startsWith('label-') || x === 'road-name' || x === 'poi-label')) set(id, state.showLabels);
  set('road-shield', state.showLabels);
  const hidden = [...state.hiddenCats];
  const catFilter: maplibregl.FilterSpecification = ['!', ['in', ['get', 'category'], ['literal', hidden]]];
  for (const id of ['poi', 'poi-label', 'poi-area', 'poi-area-line', 'poi-dot']) if (m.getLayer(id)) m.setFilter(id, catFilter);
  const hiddenLm = [...LANDMARK_GROUPS.filter((g) => state.hiddenGroups.has(g.id)).flatMap((g) => g.cats), ...state.hiddenLmCats];
  if (m.getLayer('landmark')) {
    m.setFilter('landmark', ['all', ['>=', ['zoom'], ['min', ['coalesce', ['get', 'minzoom'], 16], 16.8]], ['!', ['in', ['get', 'category'], ['literal', hiddenLm]]]]);
  }
  if (m.getLayer('landmark-dot')) {
    m.setFilter('landmark-dot', ['all', ['<', ['zoom'], ['min', ['coalesce', ['get', 'minzoom'], 16], 16.8]], ['>=', ['zoom'], ['-', ['min', ['coalesce', ['get', 'minzoom'], 16], 16.8], 1.5]], ['!', ['in', ['get', 'category'], ['literal', hiddenLm]]]]);
  }
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
  const text = [...state.places, ...state.pois, ...state.landmarks].map((f) => prop(f.properties, 'name', l)).join('');
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

/** Runs on every map move, so it touches the DOM only when the bearing or the 3D state really changes. */
let lastBearing = NaN, lastPitched: boolean | null = null;
function updateCompass(): void {
  if (!map) return;
  const b = Math.round(map.getBearing() * 2) / 2, pitched = map.getPitch() > 8;
  if (b !== lastBearing) {
    lastBearing = b;
    $('.needle').style.transform = `rotate(${-b}deg)`;
    $('#compass').classList.toggle('rotated', Math.abs(b) > 0.5);
  }
  if (pitched !== lastPitched) { lastPitched = pitched; $('#tilt').setAttribute('aria-pressed', String(pitched)); }
}

function showToast(msg: string): void {
  toast.textContent = msg;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------------------------------------
// Events

function bindUI(): void {
  initLangMenu();
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
  window.visualViewport?.addEventListener('resize', fitSheetToKeyboard);
  window.visualViewport?.addEventListener('scroll', fitSheetToKeyboard);
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
    const lmc = el.closest<HTMLButtonElement>('[data-lmcat]');
    if (lmc) {
      const c = lmc.dataset.lmcat!, g = lmc.dataset.in!;
      // Turning one on inside a hidden group shows the group with only that category.
      if (state.hiddenGroups.has(g)) {
        state.hiddenGroups.delete(g);
        for (const x of LANDMARK_GROUPS.find((y) => y.id === g)!.cats) if (x !== c) state.hiddenLmCats.add(x);
        state.hiddenLmCats.delete(c);
      } else if (state.hiddenLmCats.has(c)) state.hiddenLmCats.delete(c);
      else state.hiddenLmCats.add(c);
      renderBody();
      applyLayerVisibility();
      return;
    }
    const all = el.closest<HTMLButtonElement>('[data-all]');
    if (all) {
      const show = all.dataset.all === 'show';
      state.hiddenCats.clear(); state.hiddenGroups.clear(); state.hiddenLmCats.clear();
      if (!show) {
        for (const c of presentCats()) state.hiddenCats.add(c);
        for (const g of LANDMARK_GROUPS) state.hiddenGroups.add(g.id);
      }
      renderBody();
      applyLayerVisibility();
      return;
    }
    const tabBtn = el.closest<HTMLButtonElement>('[data-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.tab as typeof state.tab); return; }
    const grp = el.closest<HTMLButtonElement>('[data-group]');
    if (grp) {
      const g = grp.dataset.group!;
      if (state.hiddenGroups.has(g)) {
        state.hiddenGroups.delete(g);
        for (const x of LANDMARK_GROUPS.find((y) => y.id === g)!.cats) state.hiddenLmCats.delete(x);
      } else state.hiddenGroups.add(g);
      renderBody();
      applyLayerVisibility();
      return;
    }
    const tog = el.closest<HTMLButtonElement>('[data-toggle]');
    if (tog) {
      state.showLabels = !state.showLabels;
      tog.setAttribute('aria-pressed', String(state.showLabels));
      applyLayerVisibility();
      return;
    }
    const poi = el.closest<HTMLButtonElement>('[data-poi]');
    if (poi) {
      const id = poi.dataset.poi!;
      // Phones: close the keyboard and drop the sheet to half height first, so the map shows the target.
      if (phoneQuery.matches && document.activeElement === input) {
        input.blur();
        setSheet('half');
        window.setTimeout(() => selectPoi(id, { focus: true }), 260);
      } else selectPoi(id, { focus: true });
      return;
    }
    const place = el.closest<HTMLButtonElement>('[data-place]');
    if (place) {
      const f = state.places[Number(place.dataset.place)];
      if (f?.geometry?.type === 'Point') {
        if (phoneQuery.matches) { input.blur(); setSheet('peek'); }
        // Place labels sit where the official map prints the text, often beside the thing itself; when a
        // landmark has the same name, go to the landmark.
        const en = String(f.properties?.name ?? '').toLowerCase();
        const twin = state.landmarks.find((l) => l.geometry?.type === 'Point' && String(l.properties?.name ?? '').toLowerCase() === en);
        const target = ((twin ?? f).geometry as GeoJSON.Point).coordinates as [number, number];
        // On phones wait for the keyboard to close, so the padding is measured for the sheet as it ends up.
        if (phoneQuery.matches) window.setTimeout(() => flyTo(target, PLACE_ZOOM[f.properties?.kind] ?? 13.5), 260);
        else flyTo(target, PLACE_ZOOM[f.properties?.kind] ?? 13.5);
      }
      return;
    }
    if (el.closest('#back')) { selectPoi(null); (state.query ? input : body).focus(); return; }
    if (el.closest('#show-on-map')) {
      const f = byId(state.selected);
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
  $('#legend-btn').addEventListener('click', () => {
    if (state.selected) selectPoi(null);
    if (phoneQuery.matches && state.sheet === 'peek') setSheet('half');
    if (state.tab !== 'layers') setTab('layers');
    $<HTMLButtonElement>('#tab-layers')?.focus({ preventScroll: true });
  });
  $('#compass').addEventListener('click', () => map?.easeTo({ bearing: 0, pitch: map.getPitch() > 8 ? map.getPitch() : 0 }));
  $('#tilt').addEventListener('click', () => map?.easeTo({ pitch: map.getPitch() > 8 ? 0 : 58, zoom: map.getPitch() > 8 ? map.getZoom() : Math.max(map.getZoom(), 14.5) }));
  $('#fit').addEventListener('click', () => fitLeonida());

  body.addEventListener('keydown', (e) => {
    const tabBtn = (e.target as HTMLElement).closest<HTMLElement>('[role=tab]');
    if (tabBtn && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setTab(state.tab === 'finds' ? 'layers' : 'finds', true); }
  });
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

function setTab(tab: typeof state.tab, focus = false): void {
  if (state.tab === tab) return;
  state.tab = tab;
  renderBody();
  if (focus) $<HTMLButtonElement>(`#tab-${tab}`)?.focus();
}

/** Language picker: a button and a listbox, like the language list in the game's own menus. */
function initLangMenu(): void {
  const root = $('#lang'), btn = $<HTMLButtonElement>('#lang-btn'), list = $('#lang-list');
  const options = () => [...list.querySelectorAll<HTMLElement>('[role=option]')];
  let active = 0;
  const mark = (i: number) => {
    active = (i + LANGS.length) % LANGS.length;
    options().forEach((o, j) => o.classList.toggle('active', j === active));
    list.setAttribute('aria-activedescendant', options()[active].id);
  };
  const open = () => {
    if (!list.hidden) return;
    // Moved to <body>: a transformed sheet would otherwise both clip it and become its containing block.
    if (list.parentElement !== document.body) document.body.appendChild(list);
    list.hidden = false;
    // Fixed to the viewport, so a sheet or panel that clips its content can't cut the list off; opens upward
    // when there is not enough room below the button.
    const r = btn.getBoundingClientRect(), h = list.offsetHeight, gap = 8;
    const below = window.innerHeight - r.bottom - gap >= h + 12;
    list.style.top = below ? `${r.bottom + gap}px` : `${Math.max(12, r.top - gap - h)}px`;
    list.style.left = `${Math.max(12, Math.min(r.right - list.offsetWidth, window.innerWidth - list.offsetWidth - 12))}px`;
    list.classList.toggle('up', !below);
    btn.setAttribute('aria-expanded', 'true');
    root.classList.add('open');
    mark(LANGS.indexOf(lang()));
    list.focus({ preventScroll: true });
  };
  const close = (refocus = true) => {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    root.classList.remove('open');
    if (refocus) btn.focus({ preventScroll: true });
  };
  const choose = (i: number) => { close(); void changeLang(LANGS[i]); };
  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
  list.addEventListener('click', (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>('[role=option]');
    if (o) choose(LANGS.indexOf(o.dataset.lang as Lang));
  });
  list.addEventListener('pointermove', (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>('[role=option]');
    if (o) mark(LANGS.indexOf(o.dataset.lang as Lang));
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') mark(active + 1);
    else if (e.key === 'ArrowUp') mark(active - 1);
    else if (e.key === 'Home') mark(0);
    else if (e.key === 'End') mark(LANGS.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { close(false); return; }
    else return;
    e.preventDefault();
  });
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target as Node) && !list.contains(e.target as Node)) close(false); });
  window.addEventListener('resize', () => close(false));
}

// ---------------------------------------------------------------------------------------------
// Context menu: right-click (desktop) or long-press (touch) on the map

let ctxAt: { lng: number; lat: number } | null = null;

function closeContextMenu(): void {
  if (!ctxAt) return;
  ctxAt = null;
  $('#ctx').hidden = true;
  $('#ctx-ring').hidden = true;
}

function openContextMenu(m: MLMap, point: { x: number; y: number }, lngLat: maplibregl.LngLat): void {
  const lng = lngLat.lng.toFixed(7), lat = lngLat.lat.toFixed(7);
  ctxAt = { lng: lngLat.lng, lat: lngLat.lat };
  const link = `${location.origin}${location.pathname}#map=${m.getZoom().toFixed(2)}/${lat}/${lng}`;
  const q = new URLSearchParams({ template: 'map-correction.yml', link, what: `Coordinates: ${lng}, ${lat}\nZoom: ${m.getZoom().toFixed(2)}\n\n` });
  $<HTMLAnchorElement>('#ctx-fix').href = `${REPO}/issues/new?${q}`;
  $('#ctx-coords').textContent = `${lng}, ${lat}`;
  const menu = $('#ctx'), ring = $('#ctx-ring');
  ring.style.transform = `translate(${point.x}px, ${point.y}px)`;
  ring.hidden = false;
  menu.hidden = false;
  // Keep the menu inside the map, to the lower right of the spot when there is room.
  const r = m.getContainer().getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const x = Math.min(Math.max(point.x + 18, 8), r.width - w - 8);
  const y = point.y + 18 + h > r.height - 8 ? Math.max(point.y - 18 - h, 8) : point.y + 18;
  menu.style.transform = `translate(${x}px, ${y}px)`;
  $<HTMLElement>('#ctx-fix').focus({ preventScroll: true });
}

function initContextMenu(m: MLMap): void {
  m.on('contextmenu', (e) => { e.preventDefault(); openContextMenu(m, e.point, e.lngLat); });
  // Long-press on touch screens (iOS Safari never fires contextmenu on the canvas).
  let timer = 0, start: { x: number; y: number } | null = null;
  const cancel = () => { clearTimeout(timer); start = null; };
  m.on('touchstart', (e) => {
    cancel();
    if (e.originalEvent.touches.length !== 1) return;
    start = { x: e.point.x, y: e.point.y };
    const { point, lngLat } = e;
    timer = window.setTimeout(() => { if (start) openContextMenu(m, point, lngLat); }, 550);
  });
  m.on('touchmove', (e) => { if (start && Math.hypot(e.point.x - start.x, e.point.y - start.y) > 8) cancel(); });
  m.on('touchend', cancel);
  m.on('touchcancel', cancel);
  m.on('movestart', () => { if (!start) closeContextMenu(); });
  $('#ctx-copy').addEventListener('click', () => {
    if (!ctxAt) return;
    const text = `${ctxAt.lng.toFixed(7)}, ${ctxAt.lat.toFixed(7)}`;
    navigator.clipboard?.writeText(text).then(() => showToast(t('coordsCopied')), () => showToast(text));
    closeContextMenu();
  });
  $('#ctx-fix').addEventListener('click', () => closeContextMenu());
  $('#ctx').addEventListener('keydown', (e) => {
    const items = [...document.querySelectorAll<HTMLElement>('#ctx .ctx-item')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.stopPropagation(); closeContextMenu(); m.getCanvas().focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (ctxAt && !(e.target as HTMLElement).closest('#ctx')) closeContextMenu(); }, true);
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
    places: fetchLayer('places'), poi: fetchLayer('poi'), landmarks: fetchLayer('landmarks'),
    // Optional: road names may not exist yet.
    roads: fetchLayer('roads-named').catch(() => null),
  };
  let failed = false;
  const fail = (e: unknown) => { console.error(e); if (!failed) { failed = true; showToast(t('loadError')); } return null; };

  // Data, icons and fonts load while the map is created, so the tiles start loading at once.
  const dataReady = Promise.all([loads.places.catch(fail), loads.poi.catch(fail), loads.landmarks.catch(fail), prepareImages()])
    .then(([places, pois, landmarks]) => {
      state.places = places?.features ?? [];
      state.pois = pois?.features ?? [];
      state.landmarks = landmarks?.features ?? [];
      state.index = buildIndex(state.places, [...state.pois, ...state.landmarks]);
      renderBody();
      void ensureCjkFonts(lang());
      return { places, pois, landmarks };
    });

  const hash = readHash();
  // Generous and square, so a wide desktop window can still see the whole state at once.
  const [w0, s0, e0, n0] = state.landBBox;
  const half = Math.max(e0 - w0, n0 - s0) * 1.2;
  const cx = (w0 + e0) / 2, cy = (s0 + n0) / 2;
  const maxBounds: BBox = [cx - half, cy - half, cx + half, cy + half];
  // GitHub Pages speaks HTTP/2, so more tiles can be in flight at once than MapLibre's default 16.
  maplibregl.setMaxParallelImageRequests(32);
  if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  let m: MLMap;
  try {
    m = new maplibregl.Map({
      container: 'map',
      style: buildStyle(`${location.origin}${import.meta.env.BASE_URL}glyphs/{fontstack}/{range}.pbf`, lang(),
        `${location.origin}${import.meta.env.BASE_URL}tiles/day/{z}/{x}/{y}.jpg`),
      bounds: state.landBBox as LngLatBoundsLike,
      fitBoundsOptions: { padding: viewPadding() },
      transformConstrain: (center, zoom) => constrainToLeonida(maxBounds, center, zoom),
      minZoom: 10,
      maxZoom: 17,
      maxPitch: 70,
      attributionControl: false,
      localIdeographFontFamily: CJK_FONTS,
      fadeDuration: reducedMotion.matches ? 0 : 150,
      pixelRatio: window.devicePixelRatio || 1,
    });
  } catch (e) {
    console.error(e);
    $('#map').innerHTML = `<p class="map-error">${esc(t('webglError'))}</p>`;
    return;
  }
  map = m;
  if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = m;
  if (hash.view) m.jumpTo({ center: [hash.view.lng, hash.view.lat], zoom: hash.view.zoom, bearing: hash.view.bearing, pitch: hash.view.pitch });

  m.addControl(new GameScale(), 'bottom-left');
  startPrefetch(m, `${location.origin}${import.meta.env.BASE_URL}tiles/day/{z}/{x}/{y}.jpg`, TILE_SIZE);
  m.keyboard.enable();

  m.on('load', async () => {
    const { places, pois, landmarks } = await dataReady;
    if (map !== m) return;
    addImages(m);
    mapReady = true;
    const setData = (id: string, fc: FC | null) => fc && (m.getSource(id) as maplibregl.GeoJSONSource).setData(fc as GeoJSON.FeatureCollection);
    setData('places', places as FC);
    if (pois) { setData('poi', pinned(pois)); setData('poi-area', searchAreas(pois)); }
    setData('landmarks', landmarks as FC);
    void loads.roads.then((r) => setData('roads-named', r));
    applyLayerVisibility();
    if (hash.poi) selectPoi(hash.poi, { fly: !hash.view });
    updateCompass();
    document.body.classList.add('ready');
  });

  m.on('move', updateCompass);
  m.on('moveend', updateHash);
  m.on('pitchend', applyLayerVisibility);
  for (const layer of ['poi', 'landmark', 'poi-dot', 'landmark-dot']) {
    m.on('click', layer, (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) selectPoi(String(id), { fly: false });
    });
    m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
  }
  m.on('click', (e) => {
    closeContextMenu();
    if (!state.selected) return;
    const hit = m.queryRenderedFeatures(e.point, { layers: ['poi', 'landmark', 'poi-dot', 'landmark-dot'].filter((l) => m.getLayer(l)) });
    if (!hit.length) selectPoi(null);
  });
  initContextMenu(m);
}

/** The page never zooms (the map zooms itself): Safari ignores user-scalable=no, so block its gestures too. */
function lockPageZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  // Double-tap zoom outside the map.
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 320 && !(e.target as Element).closest?.('.maplibregl-canvas')) e.preventDefault();
    lastTap = now;
  }, { passive: false });
  // Pinch on the page (two fingers outside the map).
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 && !(e.target as Element).closest?.('.maplibregl-canvas')) e.preventDefault();
  }, { passive: false });
  // Desktop: Ctrl/⌘ + wheel or trackpad pinch, and Ctrl/⌘ + plus/minus/0.
  document.addEventListener('wheel', (e) => { if (e.ctrlKey && !(e.target as Element).closest?.('.maplibregl-canvas')) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].includes(e.key)) e.preventDefault();
  });
}

lockPageZoom();
void boot();

// Handle for poking at the map from the console during development.
if (import.meta.env.DEV) (window as any).__leonida = { get map() { return map; }, state };
