const app = require('./app.json');
const fs = require('fs');
const path = require('path');

module.exports = () => {
  const config = {...app.expo, android: {...app.expo.android}, ios: {...app.expo.ios}};
  // On EAS the gitignored google-services.json arrives as a file variable whose
  // value is the path EAS wrote it to; locally the checked-in path is used.
  if (process.env.GOOGLE_SERVICES_JSON) {
    config.android.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  }
  const googleServicesFile = config.android.googleServicesFile;
  if (googleServicesFile && !fs.existsSync(path.resolve(__dirname, googleServicesFile))) {
    delete config.android.googleServicesFile;
  }
  // The Facebook SDK library is autolinked into every Android build, and its
  // own manifest may request the advertising ID; the app never uses it.
  config.android.blockedPermissions = [...(config.android.blockedPermissions ?? []), 'com.google.android.gms.permission.AD_ID'];
  // Facebook Login uses the native SDK on Android. Its config plugin is added
  // only when both public values are present, so a build without them has no
  // Facebook configuration and the button keeps its "not configured" message.
  const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim();
  const facebookClientToken = process.env.FACEBOOK_CLIENT_TOKEN?.trim();
  if (facebookAppId && facebookClientToken) {
    config.plugins = [
      ...config.plugins,
      ['react-native-fbsdk-next', {
        appID: facebookAppId,
        clientToken: facebookClientToken,
        displayName: 'SmartLife',
        scheme: `fb${facebookAppId}`,
        autoLogAppEventsEnabled: false,
        advertiserIDCollectionEnabled: false,
      }],
    ];
    config.extra = {...config.extra, facebookLoginConfigured: true};
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
