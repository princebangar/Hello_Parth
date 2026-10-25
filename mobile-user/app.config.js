// app.json holds the static config; this only fills in values that come from .env (Expo loads it before this runs).
module.exports = ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const plugins = (config.plugins || []).map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'react-native-maps'
      ? ['react-native-maps', { ...plugin[1], androidGoogleMapsApiKey: mapsKey }]
      : plugin,
  );
  return { ...config, plugins };
};
