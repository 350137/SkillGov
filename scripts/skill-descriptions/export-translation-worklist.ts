// Exports missing bilingual skill descriptions to a CSV worklist for manual or external translation.
import { join } from 'node:path';
import { exportTranslationWorklist } from '../../packages/core/src/index.js';

const projectRoot = process.cwd();
const outputPath =
  process.argv[2] || join(projectRoot, 'reports', 'skill-description-translation-worklist.csv');
const result = exportTranslationWorklist({
  registryPath: join(projectRoot, 'registry', 'skill-descriptions.json'),
  outputPath,
});

console.log(JSON.stringify({ ...result, outputPath }, null, 2));
