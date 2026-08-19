// Redirects the AsyncStorage package to an in-memory stub for tests.
const TARGET = '@react-native-async-storage/async-storage';
const stub = new URL('./stubs/async-storage-memory.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === TARGET) return {shortCircuit: true, url: stub};
  return nextResolve(specifier, context);
}
