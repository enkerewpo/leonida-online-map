// Map images drawn at runtime: POI badges (from our SVGs), the swamp pattern and the route shield.
import type { Map as MLMap, StyleImageMetadata } from 'maplibre-gl';
import { CATEGORIES, badgeSVG, blipSVG } from './categories';

interface Img { data: ImageData; meta: Partial<StyleImageMetadata> }

const images = new Map<string, Img>();
const ratio = () => Math.min(Math.max(Math.round(window.devicePixelRatio || 1), 1), 3);

async function svgToImageData(svg: string, w: number, h: number, pr: number): Promise<ImageData> {
  // Safari rasterises an SVG image at its own width/height and then scales the bitmap, so the root element is
  // given the target pixel size (the viewBox keeps the drawing the same).
  const sized = svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${w * pr}" height="${h * pr}"`);
  const img = new Image(w * pr, h * pr);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = w * pr; cv.height = h * pr;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w * pr, h * pr);
  return ctx.getImageData(0, 0, cv.width, cv.height);
}

/** Badge with a soft drop shadow, so it reads on both land and sea. */
function badgeWithShadow(id: string): string {
  const inner = badgeSVG(id, 28).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="36" viewBox="0 0 34 36">` +
    `<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.3" flood-color="#0b1a24" flood-opacity=".45"/></filter></defs>` +
    `<g transform="translate(3 3)" filter="url(#s)">${inner}</g></svg>`;
}

/** Landmark blip: smaller and round, so finds (square badges) stay the loudest thing on the map. */
function blipWithShadow(id: string): string {
  const inner = blipSVG(id, 22).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">` +
    `<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#0c0d1b" flood-opacity=".4"/></filter></defs>` +
    `<g transform="translate(2 2) scale(.7857)" filter="url(#s)">${inner}</g></svg>`;
}

function swampPattern(pr: number): ImageData {
  const s = 18 * pr;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  ctx.strokeStyle = 'rgba(32, 84, 78, 0.55)';
  ctx.lineWidth = 1 * pr;
  ctx.lineCap = 'round';
  const tuft = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo((x - 2.2) * pr, y * pr); ctx.lineTo((x + 2.2) * pr, y * pr);
    ctx.moveTo(x * pr, y * pr); ctx.lineTo(x * pr, (y - 2.6) * pr);
    ctx.moveTo((x - 1.4) * pr, y * pr); ctx.lineTo((x - 2.4) * pr, (y - 1.8) * pr);
    ctx.moveTo((x + 1.4) * pr, y * pr); ctx.lineTo((x + 2.4) * pr, (y - 1.8) * pr);
    ctx.stroke();
  };
  tuft(4.5, 6); tuft(13.5, 15);
  return ctx.getImageData(0, 0, s, s);
}

function shield(pr: number): Img {
  const w = 20, h = 16;
  const cv = document.createElement('canvas');
  cv.width = w * pr; cv.height = h * pr;
  const ctx = cv.getContext('2d')!;
  ctx.scale(pr, pr);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#7d8c94';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, h - 2, 4);
  ctx.fill(); ctx.stroke();
  return {
    data: ctx.getImageData(0, 0, w * pr, h * pr),
    meta: { pixelRatio: pr, stretchX: [[5 * pr, 15 * pr]], stretchY: [[5 * pr, 11 * pr]], content: [4 * pr, 3 * pr, 16 * pr, 13 * pr] },
  };
}

export async function prepareImages(): Promise<void> {
  const pr = ratio();
  const ids = [...Object.keys(CATEGORIES), 'default'];
  await Promise.all(ids.map(async (id) => {
    try {
      images.set(`poi-${id}`, { data: await svgToImageData(badgeWithShadow(id), 34, 36, pr), meta: { pixelRatio: pr } });
    } catch (e) { console.warn(`POI icon ${id} failed to draw`, e); }
    try {
      images.set(`lm-${id}`, { data: await svgToImageData(blipWithShadow(id), 26, 26, pr), meta: { pixelRatio: pr } });
    } catch (e) { console.warn(`Landmark icon ${id} failed to draw`, e); }
  }));
  images.set('swamp', { data: swampPattern(pr), meta: { pixelRatio: pr } });
  images.set('shield', shield(pr));
}

export function addImages(map: MLMap): void {
  for (const [id, img] of images) if (!map.hasImage(id)) map.addImage(id, img.data, img.meta);
  map.on('styleimagemissing', (e) => {
    const kind = e.id.startsWith('lm-') ? 'lm-' : e.id.startsWith('poi-') ? 'poi-' : '';
    const fallback = kind && images.get(`${kind}default`);
    if (fallback && !map.hasImage(e.id)) map.addImage(e.id, fallback.data, fallback.meta);
  });
}
