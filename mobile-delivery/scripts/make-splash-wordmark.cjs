// node scripts/make-splash-wordmark.cjs <logo.png> <assetsDir>
// Splash images from the white-background delivery logo (needs `sharp`, e.g. NODE_PATH=<scratch>/node_modules):
//   splash-wordmark-light.png  the logo on transparent, dark (navy) letters made white, orange kept — for the blue splash
//   splash-icon-light.png      1024 transparent square with that wordmark 62% wide (app.json splash image, imageWidth 240)
const sharp = require('sharp');
const [src, assets] = process.argv.slice(2);

(async () => {
  const trimmed = await sharp(src).flatten({ background: '#ffffff' }).trim({ threshold: 20 }).toBuffer();
  const { data, info } = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, p = 0; i < data.length; i += ch, p += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const a = Math.max(0, Math.min(1, (255 - Math.min(r, g, b) - 18) / 150));
    if (a <= 0) continue;
    // colour without the white it was blended with
    const un = (c) => Math.max(0, Math.min(255, Math.round((c - 255 * (1 - a)) / a)));
    const R = un(r), G = un(g), B = un(b);
    const orange = R - B > 90 && R > 150;
    out[p] = orange ? R : 255;
    out[p + 1] = orange ? G : 255;
    out[p + 2] = orange ? B : 255;
    out[p + 3] = Math.round(a * 255);
  }
  const light = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const wordmark = await sharp(light).resize({ width: 900 }).png().toBuffer({ resolveWithObject: true });
  await sharp(wordmark.data).toFile(`${assets}/splash-wordmark-light.png`);
  const iconMark = await sharp(light).resize({ width: Math.round(1024 * 0.62) }).toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: iconMark, gravity: 'center' }]).png().toFile(`${assets}/splash-icon-light.png`);
  console.log('wordmark', wordmark.info.width, 'x', wordmark.info.height);
})();
