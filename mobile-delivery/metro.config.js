// Start-up speed: inline requires make a module run when it is first used instead of all of them while the bundle
// loads (Expo's default is off). Side-effect imports (index.js) still run first, in order.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const previous = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const base = previous ? await previous(...args) : {};
  return { ...base, transform: { ...(base.transform || {}), inlineRequires: true } };
};

module.exports = config;
