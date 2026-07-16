import Constants, {AppOwnership} from 'expo-constants';

export function isExpoGo() {
  return Constants.appOwnership === AppOwnership.Expo;
}
