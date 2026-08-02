import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cases = JSON.parse(await readFile(new URL('./assistant-evaluation-cases.json', import.meta.url), 'utf8'));
const requiredCategories = [
  'api_failure',
  'auth_recovery',
  'broad',
  'cross_domain',
  'finance_accuracy',
  'follow_up',
  'missing_data',
  'ocr_incomplete',
  'prompt_injection',
  'short',
  'signed_out_general',
  'task_retrieval',
  'timezone',
  'unauthorized',
  'vague',
  'write_confirmation',
];

assert.ok(Array.isArray(cases) && cases.length >= 20, 'evaluation set must contain at least 20 cases');
const ids = new Set();
for (const testCase of cases) {
  assert.equal(typeof testCase.id, 'string');
  assert.ok(!ids.has(testCase.id), `duplicate evaluation id: ${testCase.id}`);
  ids.add(testCase.id);
  assert.ok(Array.isArray(testCase.turns) && testCase.turns.length > 0, `${testCase.id} needs turns`);
  assert.ok(Array.isArray(testCase.expected) && testCase.expected.length > 0, `${testCase.id} needs measurable expectations`);
  const serialized = JSON.stringify(testCase);
  assert.doesNotMatch(serialized, /AQ\.|AIza|BEGIN PRIVATE KEY|api[_-]?key\s*[:=]/i, `${testCase.id} contains credential-like data`);
}
const categories = new Set(cases.map((testCase) => testCase.category));
requiredCategories.forEach((category) => assert.ok(categories.has(category), `missing category: ${category}`));

console.log(`SmartLife assistant evaluation set: ${cases.length} cases, ${categories.size} categories`);
