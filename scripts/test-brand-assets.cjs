// Run via `npm run test:brand-assets`: every logo and icon the app, the web
// build and the native builds point at exists, is generated from the owner's
// logo at the right size, and meets its platform's rules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PNG} = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => PNG.sync.read(fs.readFileSync(path.join(ROOT, relative.replace(/^\.\//, ''))));
const size = (relative) => { const png = read(relative); return `${png.width}x${png.height}`; };
const alphaRange = (relative) => {
  const {data} = read(relative); let min = 255, max = 0;
  for (let i = 3; i < data.length; i += 4) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); }
  return {max, min};
};

const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
assert.equal(app.name, 'SmartLife', 'the display name is unchanged');

// App icon (Expo and iOS): 1024 square and fully opaque, since iOS forbids transparency.
for (const icon of [app.icon, app.ios.icon]) {
  assert.equal(icon, './assets/brand/icon-app-1024.png');
  assert.equal(size(icon), '1024x1024');
  assert.equal(alphaRange(icon).min, 255, `${icon} has no transparent pixels`);
}

// Android adaptive icon: transparent foreground and monochrome layers, solid background colour.
const adaptive = app.android.adaptiveIcon;
assert.equal(adaptive.backgroundColor, '#F4F5EF');
for (const layer of [adaptive.foregroundImage, adaptive.monochromeImage]) {
  assert.equal(size(layer), '1024x1024');
  assert.equal(alphaRange(layer).min, 0, `${layer} keeps a transparent surround`);
  // Everything visible stays inside the 66% safe circle launchers never mask away.
  const {data, width} = read(layer);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const x = (i / 4) % width + 0.5, y = Math.floor(i / 4 / width) + 0.5;
    assert.ok(Math.hypot(x - 512, y - 512) <= 0.33 * 1024 + 2, `${layer}: pixel at ${x},${y} is outside the safe circle`);
  }
}
const mono = read(adaptive.monochromeImage);
for (let i = 0; i < mono.data.length; i += 4) if (mono.data[i + 3] > 0) assert.deepEqual([...mono.data.subarray(i, i + 3)], [255, 255, 255], 'the monochrome layer is a white silhouette');

// Notification small icon and splash, from the plugin config.
const plugin = (name) => app.plugins.filter((p) => Array.isArray(p) && p[0] === name).map((p) => p[1]);
const notifications = plugin('expo-notifications');
assert.equal(notifications.length, 2);
for (const options of notifications) {
  assert.equal(options.icon, './assets/brand/icon-notification-96.png');
  assert.equal(options.color, '#33402A');
}
assert.equal(size('./assets/brand/icon-notification-96.png'), '96x96');
const notification = read('./assets/brand/icon-notification-96.png');
for (let i = 0; i < notification.data.length; i += 4) if (notification.data[i + 3] > 0) assert.deepEqual([...notification.data.subarray(i, i + 3)], [255, 255, 255], 'the notification icon is a white silhouette');
const [splash] = plugin('expo-splash-screen');
assert.equal(splash.image, './assets/brand/brand-splash.png');
assert.equal(splash.backgroundColor, '#F4F5EF');

// Web: the manifest's icons, the favicon files and the link-preview image.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons) assert.equal(size(`public${icon.src}`), icon.sizes, icon.src);
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
assert.equal(size('public/icon-favicon-16.png'), '16x16');
assert.equal(size('public/icon-favicon-32.png'), '32x32');
assert.equal(size('public/icon-apple-touch-180.png'), '180x180');
assert.equal(alphaRange('public/icon-apple-touch-180.png').min, 255, 'iOS shows apple-touch transparency as black');
assert.equal(size('public/brand-social-1200x630.png'), '1200x630');
const ico = fs.readFileSync(path.join(ROOT, 'public/icon-favicon.ico'));
assert.equal(ico.readUInt16LE(2), 1, 'an icon file'); assert.equal(ico.readUInt16LE(4), 3, '16, 32 and 48');
assert.ok(fs.readFileSync(path.join(ROOT, 'public/favicon.ico')).equals(ico), '/favicon.ico is the same new icon');
const html = fs.readFileSync(path.join(ROOT, 'src/app/+html.tsx'), 'utf8');
for (const href of ['/icon-favicon-32.png', '/icon-apple-touch-180.png', '/manifest.webmanifest', '/brand-social-1200x630.png']) assert.ok(html.includes(href), `+html links ${href}`);

// In-app logo.
for (const s of [256, 512]) assert.equal(size(`assets/brand/brand-logo-${s}.png`), `${s}x${s}`);

console.log('brand assets passed: app icon, adaptive layers, notification, splash, web icons, manifest');
