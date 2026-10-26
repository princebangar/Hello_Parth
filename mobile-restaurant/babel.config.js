// Same import aliases as Frontend/vite.config.js, so ported files keep their imports unchanged.
// Order matters: the more specific alias must come first.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
          alias: [
            { '^@food/api/axios$': './src/services/api/axios.js' },
            { '^@food/api/config$': './src/services/api/config.js' },
            { '^@food/api$': './src/services/api' },
            { '^@food/(.+)': './src/modules/Food/\\1' },
            { '^@delivery/(.+)': './src/modules/DeliveryV2/\\1' },
            { '^@/assets/(.+)': './src/modules/Taxi/assets/\\1' },
            { '^@/components/(.+)': './src/modules/Taxi/components/\\1' },
            { '^@/(.+)': './src/\\1' },
          ].reduce((all, entry) => Object.assign(all, entry), {}),
        },
      ],
    ],
  };
};
