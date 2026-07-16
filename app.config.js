const app = require('./app.json');

module.exports = () => {
  const config = {...app.expo, android: {...app.expo.android}};
  if (process.env.EXPO_PREVIEW_ANDROID === '1') {
    delete config.android.package;
  }
  if (process.env.EXPO_ANDROID_PACKAGE) {
    config.android.package = process.env.EXPO_ANDROID_PACKAGE;
  }
  return config;
};
