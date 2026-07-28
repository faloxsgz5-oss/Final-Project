import {createRequire} from 'node:module';

import {classifyAssistantIntent} from '../src/services/assistant-intent.ts';

const require = createRequire(import.meta.url);
const {generateDataset} = require('./generate-assistant-fuzz-dataset.cjs');
const dataset = generateDataset(300);
const failures = [];
for (const testCase of dataset) {
  const previousIntent = testCase.variation_type === 'follow_up' ? testCase.expected_intent : 'unknown';
  const actual = classifyAssistantIntent(testCase.text, previousIntent);
  if (actual !== testCase.expected_intent) failures.push({...testCase, actual});
}

console.log(`SmartLife generated language tests: ${dataset.length - failures.length}/${dataset.length}`);
if (failures.length) {
  failures.slice(0, 30).forEach((failure) => console.error(failure));
  process.exitCode = 1;
}
