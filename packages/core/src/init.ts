// Project initialisation logic — creates the standard SkillGov directory tree, default config, and empty registry files.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from './config.js';

const REQUIRED_DIRS = [
  'incoming',
  'skills',
  'overlays/claude',
  'overlays/codex',
  'registry',
  'tasks/repair',
  'tasks/overlay',
  'reports',
  'backups',
];

export interface InitOptions {
  dryRun?: boolean;
}

export function initProject(root: string, options?: InitOptions): void {
  if (options?.dryRun) return;

  for (const dir of REQUIRED_DIRS) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  const config = defaultConfig(root);
  writeFileSync(join(root, 'skillgov.config.json'), JSON.stringify(config, null, 2), 'utf-8');

  writeFileSync(
    join(root, 'registry/skills.json'),
    JSON.stringify({ skills: {} }, null, 2),
    'utf-8',
  );
  writeFileSync(
    join(root, 'registry/mappings.json'),
    JSON.stringify({ mappings: {} }, null, 2),
    'utf-8',
  );
  writeFileSync(join(root, 'registry/operations.jsonl'), '', 'utf-8');
}
