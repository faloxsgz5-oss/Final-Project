// Redirects the device-only dependencies of the monthly budget service to
// in-memory stubs for tests: AsyncStorage, and the Firestore budget collection.
const stubs = new Map([
  ['@react-native-async-storage/async-storage', './stubs/async-storage-memory.mjs'],
  ['@/services/monthly-budget-remote', './stubs/monthly-budget-remote.mjs'],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = stubs.get(specifier);
  if (stub) return {shortCircuit: true, url: new URL(stub, import.meta.url).href};
  return nextResolve(specifier, context);
}
