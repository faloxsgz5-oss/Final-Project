// In-memory stand-in for @react-native-async-storage/async-storage so the
// monthly budget service can be exercised outside a device.
const store = new Map();

const AsyncStorage = {
  async clear() { store.clear(); },
  async getItem(key) { return store.has(key) ? store.get(key) : null; },
  async multiGet(keys) { return keys.map((key) => [key, store.has(key) ? store.get(key) : null]); },
  async removeItem(key) { store.delete(key); },
  async setItem(key, value) { store.set(key, String(value)); },
};

export default AsyncStorage;
