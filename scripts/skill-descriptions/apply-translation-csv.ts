// Applies translated skill description CSV rows back into registry/skill-descriptions.json.
import { join } from 'node:path';
import { applyTranslationCsv } from '../../packages/core/src/index.js';
import type { SkillDescriptionSource } from '../../packages/core/src/index.js';

const projectRoot = process.cwd();
const args = process.argv.slice(2);
const csvPath =
  args.find((arg) => !arg.startsWith('--')) ||
  join(projectRoot, 'reports', 'skill-description-translation-worklist.csv');
const sourceIndex = args.indexOf('--source');
const source =
  sourceIndex >= 0 && args[sourceIndex + 1]
    ? (args[sourceIndex + 1] as SkillDescriptionSource)
    : undefined;

const result = applyTranslationCsv({
  registryPath: join(projectRoot, 'registry', 'skill-descriptions.json'),
  csvPath,
  overwrite: args.includes('--overwrite'),
  source,
  reviewed: args.includes('--reviewed'),
});

console.log(JSON.stringify({ ...result, csvPath }, null, 2));
