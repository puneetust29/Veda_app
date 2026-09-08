// Dynamic Expo config — extends app.json with secrets from .env so API keys
// never land in source. Expo evaluates this at build time (expo start, eas build).
//
// Required .env entries (in mobile/.env — gitignored):
//   GOOGLE_MAPS_ANDROID_KEY=<android key>
//   GOOGLE_MAPS_IOS_KEY=<ios key>

const staticConfig = require('./app.json');

module.exports = ({ config }) => {
  const base = {
    ...config,
    ...staticConfig.expo,
  };

  return {
    expo: {
      ...base,
      android: {
        ...base.android,
        config: {
          ...base.android?.config,
          googleMaps: {
            apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '',
          },
        },
      },
      ios: {
        ...base.ios,
        config: {
          ...base.ios?.config,
          googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY ?? '',
        },
      },
    },
  };
};
