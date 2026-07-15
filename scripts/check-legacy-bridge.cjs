const { withLegacyDataBridge } = require('../artifacts/bridge-check/legacy-data-bridge.js');

const html = '<html><body><script>const pageKey = "admin/admin_users";</script></body></html>';
const output = withLegacyDataBridge(html);
const match = output.match(/<script data-smartlife-firestore>([\s\S]*?)<\/script>/);
if (!match) throw new Error('Firestore bridge was not injected.');
new Function(match[1]);
console.log('Bridge JavaScript syntax OK');
