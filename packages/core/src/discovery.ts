// Local skill discovery scans Codex and Claude user skill directories and reports validation status.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readRegistry } from './registry.js';
import type { InstallsRegistry, SkillsRegistry } from './registry.js';
import { validateSkill } from './validator.js';

type SkillSource = 'skillgov-project' | 'codex-user' | 'claude-user';
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
  projectRoot?: string;
  registryPath?: string;
  installsPath?: string;
}

const SOURCE_METADATA: Record<SkillSource, { sourceLabel: string; agentTargets: AgentTarget[] }> = {
  'skillgov-project': { sourceLabel: 'SkillGov 技能库', agentTargets: [] },
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

function isAgentTarget(target: string): target is AgentTarget {
  return target === 'codex' || target === 'claude';
}

function addUnique<T>(items: T[], nextItems: T[]): T[] {
  const merged = [...items];
  for (const item of nextItems) {
    if (!merged.includes(item)) merged.push(item);
  }
  return merged;
}

function mergeCandidates(
  candidates: Array<{
    name: string;
    path: string;
    source: SkillSource;
    sourceLabel: string;
    agentTargets: AgentTarget[];
  }>,
): Array<{
  name: string;
  path: string;
  source: SkillSource;
  sourceLabel: string;
  agentTargets: AgentTarget[];
}> {
  const byName = new Map<string, (typeof candidates)[number]>();

  for (const candidate of candidates) {
    const existing = byName.get(candidate.name);
    if (!existing) {
      byName.set(candidate.name, { ...candidate });
      continue;
    }

    if (!existing.sourceLabel.split('、').includes(candidate.sourceLabel)) {
      existing.sourceLabel = `${existing.sourceLabel}、${candidate.sourceLabel}`;
    }
    existing.agentTargets = addUnique(existing.agentTargets, candidate.agentTargets);
  }

  return [...byName.values()];
}

export function discoverSkills(options: DiscoveryOptions = {}): DiscoveredSkill[] {
  const home = options.home || homedir();
  const registryPath =
    options.registryPath ||
    (options.projectRoot ? join(options.projectRoot, 'registry', 'skills.json') : undefined);
  const installsPath =
    options.installsPath ||
    (options.projectRoot ? join(options.projectRoot, 'registry', 'installs.json') : undefined);

  const importedNames = new Set<string>();
  const pluginOriginNames = new Set<string>();
  if (registryPath) {
    const registry = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
    for (const [name, entry] of Object.entries(registry.skills)) {
      importedNames.add(name);
      if (entry.origin === 'codex-plugin-cache') pluginOriginNames.add(name);
    }
  }

  const installedBySkill = new Map<string, AgentTarget[]>();
  if (installsPath) {
    const registry = readRegistry<InstallsRegistry>(installsPath, { installs: {} });
    for (const record of Object.values(registry.installs)) {
      if (!isAgentTarget(record.target)) continue;
      const targets = installedBySkill.get(record.skillName) || [];
      installedBySkill.set(record.skillName, addUnique(targets, [record.target]));
    }
  }

  const projectCandidates = options.projectRoot
    ? scanSkillDir(join(options.projectRoot, 'skills'), 'skillgov-project').filter(
        (candidate) =>
          !pluginOriginNames.has(candidate.name) && existsSync(join(candidate.path, 'SKILL.md')),
      )
    : [];

  const candidates = mergeCandidates([
    ...projectCandidates,
    ...scanSkillDir(join(home, '.codex', 'skills'), 'codex-user'),
    ...scanSkillDir(join(home, '.claude', 'skills'), 'claude-user'),
  ]).filter((candidate) => !pluginOriginNames.has(candidate.name));

  const results: DiscoveredSkill[] = [];

  for (const candidate of candidates) {
    const validation = validateSkill(candidate.path);
    const agentTargets = addUnique(
      candidate.agentTargets,
      installedBySkill.get(candidate.name) || [],
    );
    results.push({
      name: candidate.name,
      path: candidate.path,
      source: candidate.source,
      sourceLabel: candidate.sourceLabel,
      agentTargets,
      validationStatus: validation.status,
      issues: validation.issues.map((i) => i.message),
      alreadyImported: importedNames.has(candidate.name) || candidate.source === 'skillgov-project',
    });
  }

  return results;
}
