#!/usr/bin/env node
// Records the promo video frame by frame with headless Chrome over the DevTools protocol: for every frame the map
// camera is set, the map is allowed to finish loading, and a screenshot is taken; ffmpeg then joins the frames.
// Needs the dev server (npx vite --port 4390) and ffmpeg. Usage: node promo/record.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, 'frames');
const W = 1920, H = 1080, FPS = 30;
const BASE = 'http://localhost:4390/leonida-online-map/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--window-size=${W},${H}`, '--hide-scrollbars',
  '--use-angle=metal', '--enable-gpu', '--force-device-scale-factor=1', '--user-data-dir=/tmp/leonida-rec', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await new Promise((r) => setTimeout(r, 1500));
await evaluate(`localStorage.setItem('leonida-map:lang','en'); location.reload(); true`);
await new Promise((r) => setTimeout(r, 4000));
await evaluate(`new Promise(r => { const m = window.__map; m.once('idle', r); m.triggerRepaint(); })`);

let frame = 0;
async function shoot(n = 1) {
  const { result } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  const buf = Buffer.from(result.data, 'base64');
  for (let i = 0; i < n; i++) writeFileSync(join(OUT, `${String(frame++).padStart(5, '0')}.jpg`), buf);
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Moves the camera from a to b over `sec` seconds, one settled frame at a time.
async function camera(a, b, sec) {
  const n = Math.round(sec * FPS);
  for (let i = 0; i <= n; i++) {
    const t = ease(i / n);
    const c = { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t, zoom: a.zoom + (b.zoom - a.zoom) * t, bearing: (a.bearing ?? 0) + ((b.bearing ?? 0) - (a.bearing ?? 0)) * t, pitch: (a.pitch ?? 0) + ((b.pitch ?? 0) - (a.pitch ?? 0)) * t };
    await evaluate(`new Promise(r => { const m = window.__map; m.jumpTo({ center: [${c.lng}, ${c.lat}], zoom: ${c.zoom}, bearing: ${c.bearing}, pitch: ${c.pitch} }); const done = () => r(true); if (m.areTilesLoaded()) requestAnimationFrame(() => requestAnimationFrame(done)); else m.once('idle', done); setTimeout(done, 2500); })`);
    await shoot();
  }
}
const hold = (sec) => shoot(Math.round(sec * FPS));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = { lng: -0.0395, lat: 0.0085, zoom: 11.25 };
const vice = { lng: -0.006, lat: 0.002, zoom: 13.7 };
const beach = { lng: 0.0035, lat: 0.0055, zoom: 15.9, bearing: -12, pitch: 0 };
await camera(state, state, 0.1);
await hold(1.2);
await camera(state, vice, 3.6);
await hold(0.6);
await camera(vice, beach, 3.2);
await hold(0.8);
// Open a place: the detail card slides in.
await evaluate(`(() => { const f = window.__leonida.state.landmarks.find(l => l.properties.id === 'L1'); location.hash = '#poi=L1'; return !!f; })()`);
for (let i = 0; i < 24; i++) { await shoot(); await wait(40); }
await hold(1.6);
// Switch to Simplified Chinese.
await evaluate(`(async () => { document.querySelector('#lang-btn').click(); await new Promise(r => setTimeout(r, 350)); [...document.querySelectorAll('#lang-list [role=option]')].find(o => o.dataset.lang === 'zh-Hans').click(); await new Promise(r => setTimeout(r, 1800)); return true; })()`);
await evaluate(`new Promise(r => { window.__map.once('idle', r); window.__map.triggerRepaint(); setTimeout(r, 3000); })`);
await hold(1.8);
await evaluate(`(() => { document.querySelector('#back')?.click(); return true; })()`);
await wait(500);
await camera(beach, state, 3.4);
await hold(1.0);
ws.close();
chrome.kill();

// End card: the cover for 2.5 s.
const cover = resolve(import.meta.dirname, 'cover.png');
const endFrame = join(OUT, 'end.jpg');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', cover, '-vf', `scale=${W}:${H}`, endFrame]);
for (let i = 0; i < 2.5 * FPS; i++) copyFileSync(endFrame, join(OUT, `${String(frame++).padStart(5, '0')}.jpg`));
rmSync(endFrame);

const mp4 = resolve(import.meta.dirname, 'leonida-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(OUT, '%05d.jpg'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-crf', '18', '-movflags', '+faststart', mp4]);
console.log(`${frame} frames -> ${mp4}`);
