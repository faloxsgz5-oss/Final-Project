const app = require('./app.json');
const fs = require('fs');
const path = require('path');

module.exports = () => {
  const config = {...app.expo, android: {...app.expo.android}, ios: {...app.expo.ios}};
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
  const googleServicesIosFile = config.ios.googleServicesFile;
  if (process.env.GOOGLE_SERVICES_INFO_PLIST) {
    config.ios.googleServicesFile = process.env.GOOGLE_SERVICES_INFO_PLIST;
  }
  if (googleServicesIosFile && !fs.existsSync(path.resolve(__dirname, googleServicesIosFile))) {
    if (!process.env.GOOGLE_SERVICES_INFO_PLIST) delete config.ios.googleServicesFile;
  }
  return config;
};
