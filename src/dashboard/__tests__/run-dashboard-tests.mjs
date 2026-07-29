import {runScoringEngineTests} from './scoringEngine.test.ts';
import {runPrioritizationServiceTests} from './prioritizationService.test.ts';

await runScoringEngineTests();
await runPrioritizationServiceTests();

console.log('SmartLife dashboard prioritization tests passed');
