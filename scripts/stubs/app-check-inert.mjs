// App Check only guards callables. The integration tests that load these
// services make no callable they depend on, so readiness resolves at once and
// no error is ever an App Check one.
export async function ensureAppCheckReady() {}
export function isAppCheckError() { return false; }
export function appCheckErrorMessage() { return ''; }
