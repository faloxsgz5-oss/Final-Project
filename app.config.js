const app = require('./app.json');
const fs = require('fs');
const path = require('path');

module.exports = () => {
  const config = {...app.expo, android: {...app.expo.android}};
  const googleServicesFile = config.android.googleServicesFile;
  if (googleServicesFile && !fs.existsSync(path.resolve(__dirname, googleServicesFile))) {
    delete config.android.googleServicesFile;
  }
  if (process.env.EXPO_PREVIEW_ANDROID === '1') {
    delete config.android.package;
  }
  if (process.env.EXPO_ANDROID_PACKAGE) {
    config.android.package = process.env.EXPO_ANDROID_PACKAGE;
  }
  return config;
};
