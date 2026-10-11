// Run via `npm run brand:assets`: every logo and app-icon file the app, the web
// build and the native builds use, generated from the one source the owner
// supplied, assets/brand/smartlife-logo-source.png.
//
// The artwork is the owner's own drawing, so this script only ever trims its
// transparent padding, scales it, centres it on a canvas, flattens it onto a
// solid background where a platform forbids transparency, and -- for Android's
// notification and themed-icon layers only -- turns its alpha channel into a
// white silhouette. Nothing is recoloured, redrawn or cropped into the artwork.
//
// The outputs are committed, so builds never depend on running this.
const fs = require('node:fs');
const path = require('node:path');
const {PNG} = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets/brand/smartlife-logo-source.png');

/**
 * The light surface behind the logo wherever a platform needs an opaque icon:
 * the app's own off-white (the splash and desktop sidebar colour), which the
 * dark green and red of the drawing read clearly on.
 */
const BRAND_BACKGROUND = '#F4F5EF';

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);

/** Decoded as premultiplied floats, so scaling never bleeds dark fringes from transparent pixels. */
function load(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const data = new Float64Array(png.width * png.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    data[i] = (png.data[i] / 255) * a; data[i + 1] = (png.data[i + 1] / 255) * a; data[i + 2] = (png.data[i + 2] / 255) * a; data[i + 3] = a;
  }
  return {data, height: png.height, width: png.width};
}

/** The artwork with its fully transparent margin removed. */
function trim(image) {
  let x0 = image.width, y0 = image.height, x1 = -1, y1 = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) throw new Error('The source logo has no visible pixels.');
  const width = x1 - x0 + 1, height = y1 - y0 + 1, data = new Float64Array(width * height * 4);
  for (let y = 0; y < height; y++) data.set(image.data.subarray(((y + y0) * image.width + x0) * 4, ((y + y0) * image.width + x1 + 1) * 4), y * width * 4);
  return {box: {x0, x1, y0, y1}, data, height, width};
}

/** Area-average resampling: each output pixel is the exact mean of the source area it covers. */
function resize(image, width, height) {
  const pass = (src, sw, sh, dw, dh, horizontal) => {
    const out = new Float64Array(dw * dh * 4);
    const n = horizontal ? sw : sh, m = horizontal ? dw : dh, scale = n / m;
    for (let o = 0; o < m; o++) {
      const start = o * scale, end = start + scale;
      for (let s = Math.floor(start); s < Math.min(n, Math.ceil(end)); s++) {
        const weight = (Math.min(end, s + 1) - Math.max(start, s)) / scale;
        if (weight <= 0) continue;
        const lines = horizontal ? sh : sw;
        for (let l = 0; l < lines; l++) {
          const si = horizontal ? (l * sw + s) * 4 : (s * sw + l) * 4;
          const di = horizontal ? (l * dw + o) * 4 : (o * dw + l) * 4;
          for (let c = 0; c < 4; c++) out[di + c] += src[si + c] * weight;
        }
      }
    }
    return out;
  };
  const wide = pass(image.data, image.width, image.height, width, image.height, true);
  return {data: pass(wide, width, image.height, width, height, false), height, width};
}

/** How far the drawing's visible pixels reach from its centre, for fitting it inside a round mask. */
function reach(image) {
  const cx = image.width / 2, cy = image.height / 2;
  let max = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] > 0.06) max = Math.max(max, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
  }
  return max;
}

/** Coverage (0-1) of a rounded rectangle filling the canvas, 4x4 supersampled for smooth corners. */
function roundedCoverage(x, y, width, height, corner) {
  let hits = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
    const dx = Math.max(corner - px, px - (width - corner), 0), dy = Math.max(corner - py, py - (height - corner), 0);
    if (dx * dx + dy * dy <= corner * corner) hits++;
  }
  return hits / 16;
}

/**
 * The artwork scaled to fit `box` (a fraction of the canvas), and also inside
 * a circle of `radius` (a fraction of the canvas width) when a launcher masks
 * the icon to a circle; centred, on `background` (square, or a rounded tile
 * when `tile` gives its corner radius as a fraction of the width) or
 * transparent.
 */
function compose(art, {background = null, box = 1, height, radius = null, silhouette = false, tile = null, width}) {
  let scale = Math.min((width * box) / art.width, (height * box) / art.height);
  if (radius) scale = Math.min(scale, (radius * width) / art.reach);
  const dw = Math.max(1, Math.round(art.width * scale)), dh = Math.max(1, Math.round(art.height * scale));
  const scaled = resize(art, dw, dh);
  const ox = Math.round((width - dw) / 2), oy = Math.round((height - dh) / 2);
  const out = new Float64Array(width * height * 4);
  if (background) {
    const [r, g, b] = hex(background);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, a = tile ? roundedCoverage(x, y, width, height, tile * width) : 1;
      out[i] = r * a; out[i + 1] = g * a; out[i + 2] = b * a; out[i + 3] = a;
    }
  }
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const si = (y * dw + x) * 4, di = ((y + oy) * width + x + ox) * 4, a = scaled.data[si + 3];
    const ink = silhouette ? [a, a, a, a] : [scaled.data[si], scaled.data[si + 1], scaled.data[si + 2], a];
    for (let c = 0; c < 4; c++) out[di + c] = ink[c] + out[di + c] * (1 - a);
  }
  return {data: out, height, width};
}

function encode(image) {
  const png = new PNG({height: image.height, width: image.width});
  for (let i = 0; i < image.data.length; i += 4) {
    const a = image.data[i + 3];
    for (let c = 0; c < 3; c++) png.data[i + c] = a > 0 ? Math.round(Math.min(1, image.data[i + c] / a) * 255) : 0;
    png.data[i + 3] = Math.round(Math.min(1, a) * 255);
  }
  return PNG.sync.write(png, {colorType: 6});
}

/** A .ico holding PNG-encoded images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({png, size}, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({png}) => png)]);
}

const written = [];
function write(relative, buffer) {
  const file = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, buffer);
  written.push(relative);
}

const art = trim(load(SOURCE));
art.reach = reach(art);
const square = (size, options = {}) => encode(compose(art, {height: size, width: size, ...options}));

// In-app logo (BrandLogo): the trimmed drawing with ~3% breathing room each side.
for (const size of [512, 256]) write(`assets/brand/brand-logo-${size}.png`, square(size, {box: 0.94}));
// Splash: the trimmed drawing; app.json sets how wide it shows.
write('assets/brand/brand-splash.png', square(1024));
// App icon (Expo / iOS): no transparency allowed, so on the light surface with a comfortable margin.
write('assets/brand/icon-app-1024.png', square(1024, {background: BRAND_BACKGROUND, box: 0.76}));
// Android adaptive icon: the drawing inside the 66% safe circle every launcher mask keeps.
write('assets/brand/icon-adaptive-foreground.png', square(1024, {box: 0.66, radius: 0.33}));
write('assets/brand/icon-adaptive-monochrome.png', square(1024, {box: 0.66, radius: 0.33, silhouette: true}));
// Android notification small icon: a white silhouette; Expo derives the density variants from it.
write('assets/brand/icon-notification-96.png', square(96, {box: 0.84, silhouette: true}));

// Web. A browser tab or a launcher can be dark, and the drawing's dark green
// strokes vanish on dark, so the favicon and the regular PWA icons sit on a
// light rounded tile (the drawing itself is untouched).
const favicon = (size) => square(size, {background: BRAND_BACKGROUND, box: 0.92, tile: 0.2});
write('public/icon-favicon-16.png', favicon(16));
write('public/icon-favicon-32.png', favicon(32));
const faviconIco = ico([16, 32, 48].map((size) => ({png: favicon(size), size})));
// A new name, so no browser keeps showing a cached copy of the old mark; the
// classic /favicon.ico (requested by browsers on their own) gets it too.
write('public/icon-favicon.ico', faviconIco);
write('public/favicon.ico', faviconIco);
write('public/icon-apple-touch-180.png', square(180, {background: BRAND_BACKGROUND, box: 0.82}));
for (const size of [192, 512]) {
  write(`public/icon-pwa-${size}.png`, square(size, {background: BRAND_BACKGROUND, box: 0.84, tile: 0.2}));
  // Maskable: the drawing inside the central 80% safe circle, on a solid surface.
  write(`public/icon-maskable-${size}.png`, square(size, {background: BRAND_BACKGROUND, box: 0.8, radius: 0.4}));
}
write('public/brand-social-1200x630.png', encode(compose(art, {background: BRAND_BACKGROUND, box: 0.7, height: 630, width: 1200})));

console.log(`source ${path.relative(ROOT, SOURCE)}: visible area x ${art.box.x0}-${art.box.x1}, y ${art.box.y0}-${art.box.y1} (${art.width}x${art.height})`);
console.log(`wrote ${written.length} files:\n  ${written.join('\n  ')}`);
