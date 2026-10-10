import AsyncStorage from '@react-native-async-storage/async-storage';

import {createSeenStore} from '@/lib/notification-seen';

/**
 * The one seen-record store the app uses. AsyncStorage is the app's own storage
 * on Android and iOS and is backed by localStorage on the web; the store wraps
 * every call so blocked storage falls back to memory instead of throwing.
 */
export const seenStore = createSeenStore(AsyncStorage);
