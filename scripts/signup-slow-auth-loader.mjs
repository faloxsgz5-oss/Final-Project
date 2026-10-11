// Sends `firebase/auth` through the slow-profile stand-in, except from inside
// the stand-in itself, which needs the real module.
const STUB = new URL('./stubs/firebase-auth-slow-profile.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'firebase/auth' && context.parentURL !== STUB) return {shortCircuit: true, url: STUB};
  return nextResolve(specifier, context);
}
