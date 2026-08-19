// In-memory stand-in for @react-native-async-storage/async-storage so the
// monthly budget service can be exercised outside a device.
//
// Storage is per "device": AsyncStorage is local to one install, so switching
// devices swaps the whole store. That is what makes a phone-then-web sync test
// meaningful rather than a single shared map pretending to be two devices.
const devices = new Map();
let current = 'device-a';

function store() {
  if (!devices.has(current)) devices.set(current, new Map());
  return devices.get(current);
}

/** Switches to another device's local storage, creating it on first use. */
export function __useDevice(name) {
  current = name;
}

export function __reset() {
  devices.clear();
  current = 'device-a';
}

const AsyncStorage = {
  async clear() { store().clear(); },
  async getItem(key) { return store().has(key) ? store().get(key) : null; },
  async multiGet(keys) { return keys.map((key) => [key, store().has(key) ? store().get(key) : null]); },
  async removeItem(key) { store().delete(key); },
  async setItem(key, value) { store().set(key, String(value)); },
};

export default AsyncStorage;
