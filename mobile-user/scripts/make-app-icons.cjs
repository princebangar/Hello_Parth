// node scripts/make-app-icons.cjs <logo.png> <assetsDir> [splashLogoOut.png]
// App icons from a white-background wordmark logo, with the sizes used for the user app (Prince checked these on his
// phone: "zoomed out a little", not cropped by the launcher mask):
//   icon.png 1024 white square, wordmark 740 px wide; android-icon-foreground.png 1024 transparent, wordmark 540 px
//   (adaptive icon safe zone; app.json adaptiveIcon backgroundColor #ffffff); monochrome + notification silhouettes.
const sharp = require('sharp');
const [src, assets, splashOut] = process.argv.slice(2);

(async () => {
  // crop to the logo itself (+ a small margin) instead of the user logo's hard-coded box
  const trimmed = await sharp(src).flatten({ background: '#ffffff' }).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
  const pad = 14;
  const raw = await sharp(trimmed.data)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // faint grey compression noise behind the letters -> pure white
  const d = raw.data;
  const ch = raw.info.channels;
  for (let i = 0; i < d.length; i += ch) {
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    if (min > 215 && max - min < 20) d[i] = d[i + 1] = d[i + 2] = 255;
  }
  const crop = await sharp(d, { raw: { width: raw.info.width, height: raw.info.height, channels: ch } }).png().toBuffer();

  const iconLogo = await sharp(crop).resize({ width: 740 }).toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } })
    .composite([{ input: iconLogo, gravity: 'center' }]).png().toFile(`${assets}/icon.png`);

  const fgLogo = await sharp(crop).resize({ width: 540 }).toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
    .composite([{ input: fgLogo, gravity: 'center' }]).png().toFile(`${assets}/android-icon-foreground.png`);

  const sil = async (width) => {
    const { data, info } = await sharp(crop).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0; i < info.width * info.height; i++) {
      const lum = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
      out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((235 - lum) * 1.6)));
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  };
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sil(540), gravity: 'center' }]).png().toFile(`${assets}/android-icon-monochrome.png`);
  await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sil(92), gravity: 'center' }]).png().toFile(`${assets}/notification-icon.png`);

  if (splashOut) await sharp(crop).resize({ width: 840 }).png().toFile(splashOut);
  console.log('done');
})();
