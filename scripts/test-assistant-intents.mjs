import {readFile} from 'node:fs/promises';

import {classifyAssistantIntent} from '../src/services/assistant-intent.ts';

const datasetUrl = new URL('./thai-assistant-intents.json', import.meta.url);
const dataset = JSON.parse(await readFile(datasetUrl, 'utf8'));

if (!Array.isArray(dataset) || dataset.length !== 150) {
  throw new Error(`Expected exactly 150 test cases, received ${dataset?.length ?? 0}.`);
}

const failures = [];
const counts = new Map();

for (const testCase of dataset) {
  const previousIntent = testCase.variation_type === 'follow_up'
    ? testCase.expected_intent
    : 'unknown';
  const actual = classifyAssistantIntent(testCase.text, previousIntent);
  const key = `${testCase.expected_intent}/${testCase.variation_type}`;
  const current = counts.get(key) ?? {passed: 0, total: 0};
  current.total += 1;
  if (actual === testCase.expected_intent) {
    current.passed += 1;
  } else {
    failures.push({...testCase, actual});
  }
  counts.set(key, current);
}

const passed = dataset.length - failures.length;
const accuracy = passed / dataset.length;
console.log(`SmartLife Thai intent tests: ${passed}/${dataset.length} (${(accuracy * 100).toFixed(1)}%)`);
for (const [key, result] of [...counts].sort()) {
  console.log(`- ${key}: ${result.passed}/${result.total}`);
}

if (failures.length) {
  console.error('\nMisclassified cases:');
  failures.forEach((item) => {
    console.error(`- [${item.expected_intent} -> ${item.actual}] ${item.text}`);
  });
}

if (accuracy < 0.95) {
  process.exitCode = 1;
}
