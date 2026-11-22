#!/usr/bin/env node
// Records the promo video frame by frame with headless Chrome over the DevTools protocol, then adds the radio-style
// voice-over (promo/vo/*.wav, from promo/script.json via `say`), the music (promo/bgm/neon-night.wav: "Neon Night" by Fatal Exit, CC BY 4.0,
// https://fatalexit.itch.io/neon-night-free-cca-synthwave-music-for-games, not committed) and burnt-in captions
// (drawn in the page itself). Every scene lasts as long as its line plus a breath.
// Needs the dev server (npx vite --port 4390), ffmpeg and python3 with numpy + scipy. Usage: node promo/record.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = import.meta.dirname;
// Music: BGM=<file> (default promo/bgm/track.*); BGM_CREDIT="..." adds a credit line to the end card.
const BGM = process.env.BGM || join(DIR, 'bgm', readdirSync(join(DIR, 'bgm')).find((f) => f.startsWith('track.')) ?? 'neon-night.wav');
const OUT = resolve(DIR, 'frames');
const W = 1920, H = 1080, FPS = 30;
const BASE = 'http://localhost:4390/leonida-online-map/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const script = JSON.parse(readFileSync(join(DIR, 'script.json'), 'utf8'));
const voDur = Object.fromEntries(script.map((s) => [s.id, Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(DIR, 'vo', `${s.id}.wav`)]).toString())]));
const sceneLen = (id) => voDur[id] + 0.9;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--window-size=${W},${H}`, '--hide-scrollbars',
  '--use-angle=metal', '--enable-gpu', '--force-device-scale-factor=1', '--user-data-dir=/tmp/leonida-rec', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const page = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = () => js(`new Promise(r => { const m = window.__map; m.once('idle', () => r(true)); m.triggerRepaint(); setTimeout(() => r(true), 4000); })`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await wait(1500);
await js(`localStorage.setItem('leonida-map:lang','en'); location.reload(); true`);
await wait(4000);
await idle();

// Caption overlay: a feature title top left, the spoken line as a subtitle at the bottom.
await js(`(() => {
  const s = document.createElement('style');
  s.textContent = \`
    #promo-title { display: none; }
    #promo-cap { position: fixed; left: 50%; bottom: 58px; transform: translateX(-50%); z-index: 9999; width: 1100px;
      color: #fff; text-align: center; font: 500 32px/1.3 Figtree, sans-serif;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 1px rgba(0, 0, 0, 0.9); }
    #promo-cap:empty { opacity: 0; }\`;
  document.head.append(s);
  for (const id of ['promo-title', 'promo-cap']) { const d = document.createElement('div'); d.id = id; document.body.append(d); }
  // Over the map, clear of the side panel.
  const r = document.getElementById('map').getBoundingClientRect();
  const panel = [...document.querySelectorAll('aside, .sheet, #panel')].map(e => e.getBoundingClientRect()).find(b => b.width > 200 && b.width < r.width / 2 && b.left < 40);
  const left = panel ? panel.right : r.left;
  document.getElementById('promo-title').style.left = (left + 48) + 'px';
  document.getElementById('promo-cap').style.left = ((left + r.right) / 2) + 'px';
  return true;
})()`);
const caption = (title, line) => js(`(() => { document.getElementById('promo-title').textContent = ${JSON.stringify(title)}; document.getElementById('promo-cap').textContent = ${JSON.stringify(line)}; return true; })()`);

let frame = 0;
const starts = {};
let currentCaption = () => '';
let shownCaption = null;
async function shoot(n = 1) {
  for (let i = 0; i < n; i++) {
    const c = currentCaption();
    if (c !== shownCaption) { shownCaption = c; await caption('', c); }
    await shootOne();
  }
}
async function shootOne() {
  const { result } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  writeFileSync(join(OUT, `${String(frame++).padStart(5, '0')}.jpg`), Buffer.from(result.data, 'base64'));
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function camera(a, b, sec) {
  const n = Math.round(sec * FPS);
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n);
    const c = { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t, zoom: a.zoom + (b.zoom - a.zoom) * t };
    await js(`new Promise(r => { const m = window.__map; m.jumpTo({ center: [${c.lng}, ${c.lat}], zoom: ${c.zoom} }); const done = () => r(true); if (m.areTilesLoaded()) requestAnimationFrame(() => requestAnimationFrame(done)); else m.once('idle', done); setTimeout(done, 2500); })`);
    await shoot();
  }
}
// Real-time UI moments (panels sliding, menus): a few frames with a little time between them.
async function live(n, ms = 33) { for (let i = 0; i < n; i++) { await shoot(); await wait(ms); } }
async function scene(sid, body) {
  const s = script.find((x) => x.id === sid);
  starts[sid] = frame / FPS;
  const lines = s.lines.map((l) => l[1]);
  const total = lines.reduce((n, l) => n + l.length, 0);
  const until = []; let acc = 0;
  for (const l of lines) { acc += l.length; until.push(starts[sid] + 0.25 + voDur[sid] * acc / total); }
  currentCaption = () => { const t = frame / FPS; const i = until.findIndex((u) => t < u); return i < 0 ? '' : lines[i]; };
  await caption('', currentCaption());
  await body();
  const left = Math.round((starts[sid] + sceneLen(sid)) * FPS) - frame;
  if (left > 0) await shoot(left);
}
const click = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e?.click(); return !!e; })()`);

const state = { lng: -0.0395, lat: 0.0085, zoom: 11.25 };
const vice = { lng: -0.006, lat: 0.003, zoom: 13.6 };
const downtown = { lng: -0.0074, lat: 0.0049, zoom: 16.3 };
const wide = { lng: -0.0065, lat: 0.004, zoom: 14.6 };
await js(`(() => { window.__map.jumpTo({ center: [${state.lng}, ${state.lat}], zoom: ${state.zoom} }); return true; })()`);
await idle();

await scene('intro', () => camera(state, { ...state, zoom: 11.6 }, sceneLen('intro') - 0.2));
await scene('zoom', () => camera({ ...state, zoom: 11.6 }, vice, 5.2));
await scene('marks', () => camera(vice, downtown, 5.0));
await scene('legend', async () => {
  await click('#legend-btn'); await live(14);
  await click('[data-all="hide"]'); await live(10);
  await js(`(() => { const e = document.querySelector('[data-lmcat="gas"]'); e?.scrollIntoView({ block: 'center' }); e?.click(); return !!e; })()`);
  await live(6);
  await camera(downtown, wide, 2.2);
});
await scene('search', async () => {
  await click('[data-all="show"]');
  await js(`(() => { const m = window.__map; m.__fly = m.flyTo; m.flyTo = (o) => { window.__flyTarget = o; }; return true; })()`);
  await click('[data-tab="search"]');
  await js(`(() => { const q = document.getElementById('q'); q.focus(); return true; })()`);
  for (const ch of 'airport') {
    await js(`(() => { const q = document.getElementById('q'); q.value += ${JSON.stringify(ch)}; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await live(3);
  }
  await live(8);
  await click('[data-place]');
  const tgt = await js(`(() => { const o = window.__flyTarget; const c = Array.isArray(o.center) ? o.center : [o.center.lng, o.center.lat]; return { lng: c[0], lat: c[1], zoom: o.zoom }; })()`);
  await js(`(() => { const m = window.__map; m.flyTo = m.__fly; return true; })()`);
  await camera(wide, tgt, 2.4);
});
await scene('lang', async () => {
  await js(`(() => { location.hash = '#poi=L1'; return true; })()`);
  await wait(300); await live(16);
  await idle(); await shoot(12);
  await click('#lang-btn'); await live(10, 60);
  await js(`(() => { [...document.querySelectorAll('#lang-list [role=option]')].find(o => o.dataset.lang === 'zh-Hans')?.click(); return true; })()`);
  await wait(1500); await idle(); await shoot(1);
});
await scene('fix', async () => {
  await click('#back');
  await js(`(() => { [...document.querySelectorAll('#lang-list [role=option]')].find(o => o.dataset.lang === 'en')?.click(); return true; })()`);
  await wait(1500); await idle();
  await shoot(15);
  await js(`(() => { const m = window.__map; const p = { x: m.getCanvas().clientWidth * 0.55, y: m.getCanvas().clientHeight * 0.45 }; m.fire('contextmenu', { point: p, lngLat: m.unproject([p.x, p.y]), preventDefault() {}, originalEvent: new MouseEvent('contextmenu') }); return true; })()`);
  await live(12);
});
await scene('outro', async () => {
  await js(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  const from = await js(`(() => { const m = window.__map, c = m.getCenter(); return { lng: c.lng, lat: c.lat, zoom: m.getZoom() }; })()`);
  await camera(from, state, 2.6);
  // End card: the cover, with the line still captioned underneath.
  // The cover with the music credit added.
  execFileSync(CHROME, ['--headless=new', '--hide-scrollbars', '--user-data-dir=/tmp/leonida-end', '--allow-file-access-from-files',
    '--window-size=1600,900', `--force-device-scale-factor=${W / 1600}`, '--virtual-time-budget=3000', `--screenshot=${join(OUT, 'end.png')}`,
    `file://${resolve(DIR, 'cover.html')}?${encodeURIComponent(process.env.BGM_CREDIT ?? '')}`], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(OUT, 'end.png'), join(OUT, 'end.jpg')]);
  rmSync(join(OUT, 'end.png'));
  const left = Math.round((starts.outro + sceneLen('outro') + 1.2) * FPS) - frame;
  for (let i = 0; i < left; i++) copyFileSync(join(OUT, 'end.jpg'), join(OUT, `${String(frame++).padStart(5, '0')}.jpg`));
  rmSync(join(OUT, 'end.jpg'));
});
ws.close();
chrome.kill();

// Sound: music bed, ducked under the voice; each line placed at its scene's start (+0.25 s).
const total = frame / FPS;
const music = join(DIR, 'music.wav');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', BGM, '-t', String(total),
  '-af', `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 2.5)}:d=2.5`, music]);
const lines = script.map((s) => s.id);
const inputs = ['-i', music, ...lines.flatMap((l) => ['-i', join(DIR, 'vo', `${l}.wav`)])];
const delays = lines.map((l, i) => `[${i + 1}]adelay=${Math.round((starts[l] + 0.25) * 1000)}:all=1[v${i}]`).join(';');
const filter = `${delays};${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,volume=1.6,asplit=2[vo][key];` +
  `[0]volume=0.9[bed];[bed][key]sidechaincompress=threshold=0.05:ratio=3:attack=30:release=500[duck];[duck][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`;
const audio = join(DIR, 'mix.wav');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[a]', '-t', String(total), audio]);

const mp4 = resolve(DIR, 'leonida-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(OUT, '%05d.jpg'), '-i', audio,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
rmSync(music); rmSync(audio);
console.log(`${frame} frames, ${total.toFixed(1)} s -> ${mp4}`);
