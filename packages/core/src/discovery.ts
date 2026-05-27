// Local skill discovery scans Codex and Claude user skill directories and reports validation status.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readRegistry } from './registry.js';
import type { SkillsRegistry } from './registry.js';
import { validateSkill } from './validator.js';

type SkillSource = 'codex-user' | 'claude-user';
type AgentTarget = 'codex' | 'claude';

export interface DiscoveredSkill {
  name: string;
  path: string;
  source: SkillSource;
  sourceLabel: string;
  agentTargets: AgentTarget[];
  validationStatus: 'pass' | 'fixable' | 'fail';
  issues: string[];
  alreadyImported: boolean;
}

export interface DiscoveryOptions {
  home?: string;
  registryPath?: string;
}

const SOURCE_METADATA: Record<SkillSource, { sourceLabel: string; agentTargets: AgentTarget[] }> = {
  'codex-user': { sourceLabel: 'Codex 技能目录', agentTargets: ['codex'] },
  'claude-user': { sourceLabel: 'Claude 技能目录', agentTargets: ['claude'] },
};

function scanSkillDir(
  dir: string,
  source: SkillSource,
): Array<{
  name: string;
  path: string;
  source: SkillSource;
  sourceLabel: string;
  agentTargets: AgentTarget[];
}> {
  const results: Array<{
    name: string;
    path: string;
    source: SkillSource;
    sourceLabel: string;
    agentTargets: AgentTarget[];
  }> = [];
  if (!existsSync(dir)) return results;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry === '.system') continue;
    const fullPath = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push({
        name: entry,
        path: fullPath,
        source,
        sourceLabel: SOURCE_METADATA[source].sourceLabel,
        agentTargets: [...SOURCE_METADATA[source].agentTargets],
      });
    }
  }

  return results;
}

export function discoverSkills(options: DiscoveryOptions = {}): DiscoveredSkill[] {
  const home = options.home || homedir();
  const registryPath = options.registryPath;

  const importedNames = new Set<string>();
  if (registryPath) {
    const registry = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
    for (const name of Object.keys(registry.skills)) {
      importedNames.add(name);
    }
  }

  const candidates = [
    ...scanSkillDir(join(home, '.codex', 'skills'), 'codex-user'),
    ...scanSkillDir(join(home, '.claude', 'skills'), 'claude-user'),
  ];

  const results: DiscoveredSkill[] = [];

  for (const candidate of candidates) {
    const validation = validateSkill(candidate.path);
    results.push({
      name: candidate.name,
      path: candidate.path,
      source: candidate.source,
      sourceLabel: candidate.sourceLabel,
      agentTargets: candidate.agentTargets,
      validationStatus: validation.status,
      issues: validation.issues.map((i) => i.message),
      alreadyImported: importedNames.has(candidate.name),
    });
  }

  return results;
}
