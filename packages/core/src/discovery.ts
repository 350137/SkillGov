// Local skill discovery scans SkillGov-managed skills plus Codex and Claude user skill directories.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getMappingTargets } from './mapping.js';
import { readRegistry } from './registry.js';
import type { InstallsRegistry, SkillsRegistry } from './registry.js';
import { validateSkill } from './validator.js';

type SkillSource = 'skillgov-project' | 'codex-user' | 'claude-user';
type AgentTarget = 'codex' | 'claude';

export interface AppliedAgent {
  id: string;
  label: string;
  source: 'local' | 'install' | 'mapping';
}

export interface MappingSummary {
  total: number;
  linked: number;
  missing: number;
  conflict: number;
}

export interface DiscoveredSkill {
  name: string;
  path: string;
  source: SkillSource;
  sourceLabel: string;
  agentTargets: AgentTarget[];
  appliedAgents: AppliedAgent[];
  mappingTargets: ReturnType<typeof getMappingTargets>;
  mappingSummary: MappingSummary;
  validationStatus: 'pass' | 'fixable' | 'fail';
  issues: string[];
  alreadyImported: boolean;
}

export interface NonSkillDirectory {
  name: string;
  path: string;
  source: SkillSource;
  sourceLabel: string;
  issue: 'Missing SKILL.md';
}

export interface SkillInventory {
  skills: DiscoveredSkill[];
  nonSkillDirectories: NonSkillDirectory[];
}

export interface DiscoveryOptions {
  home?: string;
  projectRoot?: string;
  registryPath?: string;
  installsPath?: string;
  mappingsPath?: string;
}

const SOURCE_METADATA: Record<SkillSource, { sourceLabel: string; agentTargets: AgentTarget[] }> = {
  'skillgov-project': { sourceLabel: 'SkillGov 技能库', agentTargets: [] },
  'codex-user': { sourceLabel: 'Codex 本地', agentTargets: ['codex'] },
  'claude-user': { sourceLabel: 'Claude 本地', agentTargets: ['claude'] },
};

const ORIGIN_LABELS: Record<string, string> = {
  local: '手动导入',
  'codex-user': 'Codex 本地',
  'claude-user': 'Claude 本地',
  'codex-plugin-cache': 'Codex 插件缓存',
};

interface SkillCandidate {
  name: string;
  path: string;
  source: SkillSource;
  sourceLabel: string;
  agentTargets: AgentTarget[];
  appliedAgents: AppliedAgent[];
}

function scanSkillDir(
  dir: string,
  source: SkillSource,
): { skills: SkillCandidate[]; nonSkillDirectories: NonSkillDirectory[] } {
  const skills: SkillCandidate[] = [];
  const nonSkillDirectories: NonSkillDirectory[] = [];
  if (!existsSync(dir)) return { skills, nonSkillDirectories };

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { skills, nonSkillDirectories };
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
    if (!stat.isDirectory()) continue;
    const base = {
      name: entry,
      path: fullPath,
      source,
      sourceLabel: SOURCE_METADATA[source].sourceLabel,
    };
    if (existsSync(join(fullPath, 'SKILL.md'))) {
      const agentTargets = [...SOURCE_METADATA[source].agentTargets];
      skills.push({
        ...base,
        agentTargets,
        appliedAgents: agentTargets.map((id) => ({
          id,
          label: SOURCE_METADATA[source].sourceLabel,
          source: 'local' as const,
        })),
      });
    } else {
      nonSkillDirectories.push({
        ...base,
        issue: 'Missing SKILL.md',
      });
    }
  }

  return { skills, nonSkillDirectories };
}

function mapProjectCandidateOrigin(
  candidates: SkillCandidate[],
  importedOrigins: Map<string, string>,
): SkillCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    sourceLabel: labelForOrigin(importedOrigins.get(candidate.name)),
  }));
}

function mapProjectNonSkillOrigin(
  directories: NonSkillDirectory[],
  importedOrigins: Map<string, string>,
): NonSkillDirectory[] {
  return directories.map((directory) => ({
    ...directory,
    sourceLabel: labelForOrigin(importedOrigins.get(directory.name)),
  }));
}

function scanInventoryRoots(
  options: DiscoveryOptions,
  home: string,
  importedOrigins: Map<string, string>,
): { candidates: SkillCandidate[]; nonSkillDirectories: NonSkillDirectory[] } {
  const candidates: SkillCandidate[] = [];
  const nonSkillDirectories: NonSkillDirectory[] = [];

  if (options.projectRoot) {
    const projectScan = scanSkillDir(join(options.projectRoot, 'skills'), 'skillgov-project');
    candidates.push(...mapProjectCandidateOrigin(projectScan.skills, importedOrigins));
    nonSkillDirectories.push(
      ...mapProjectNonSkillOrigin(projectScan.nonSkillDirectories, importedOrigins),
    );
  }

  const codexScan = scanSkillDir(join(home, '.codex', 'skills'), 'codex-user');
  candidates.push(...codexScan.skills);
  nonSkillDirectories.push(...codexScan.nonSkillDirectories);

  const claudeScan = scanSkillDir(join(home, '.claude', 'skills'), 'claude-user');
  candidates.push(...claudeScan.skills);
  nonSkillDirectories.push(...claudeScan.nonSkillDirectories);

  return { candidates, nonSkillDirectories };
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

function labelForOrigin(origin?: string): string {
  if (!origin) return SOURCE_METADATA['skillgov-project'].sourceLabel;
  return ORIGIN_LABELS[origin] || origin;
}

function mergeAppliedAgents(existing: AppliedAgent[], incoming: AppliedAgent[]): AppliedAgent[] {
  const merged = [...existing];
  for (const agent of incoming) {
    if (!merged.some((a) => a.id === agent.id)) {
      merged.push(agent);
    }
  }
  return merged;
}

function mergeCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  const byName = new Map<string, (typeof candidates)[number]>();

  for (const candidate of candidates) {
    const existing = byName.get(candidate.name);
    if (!existing) {
      byName.set(candidate.name, { ...candidate, appliedAgents: [...candidate.appliedAgents] });
      continue;
    }

    if (!existing.sourceLabel.split('、').includes(candidate.sourceLabel)) {
      if (existing.source === 'skillgov-project') {
        // Keep provenance in the source column and track agent usage separately.
      } else if (candidate.source === 'skillgov-project') {
        existing.path = candidate.path;
        existing.source = candidate.source;
        existing.sourceLabel = candidate.sourceLabel;
      } else {
        existing.sourceLabel = `${existing.sourceLabel}、${candidate.sourceLabel}`;
      }
    }
    existing.agentTargets = addUnique(existing.agentTargets, candidate.agentTargets);
    existing.appliedAgents = mergeAppliedAgents(existing.appliedAgents, candidate.appliedAgents);
  }

  return [...byName.values()];
}

export function discoverSkillInventory(options: DiscoveryOptions = {}): SkillInventory {
  const home = options.home || homedir();
  const registryPath =
    options.registryPath ||
    (options.projectRoot ? join(options.projectRoot, 'registry', 'skills.json') : undefined);
  const installsPath =
    options.installsPath ||
    (options.projectRoot ? join(options.projectRoot, 'registry', 'installs.json') : undefined);
  const mappingsPath =
    options.mappingsPath ||
    (options.projectRoot ? join(options.projectRoot, 'registry', 'mappings.json') : undefined);

  const importedNames = new Set<string>();
  const importedOrigins = new Map<string, string>();
  if (registryPath) {
    const registry = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
    for (const [name, entry] of Object.entries(registry.skills)) {
      importedNames.add(name);
      importedOrigins.set(name, entry.origin);
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

  const scanned = scanInventoryRoots(options, home, importedOrigins);
  const candidates = mergeCandidates(scanned.candidates);

  const results: DiscoveredSkill[] = [];

  for (const candidate of candidates) {
    const validation = validateSkill(candidate.path);
    const mappingTargets = getMappingTargets(candidate.name, mappingsPath);

    const mappingSummary: MappingSummary = { total: 0, linked: 0, missing: 0, conflict: 0 };
    for (const mapping of mappingTargets) {
      mappingSummary.total++;
      if (mapping.status === 'linked') mappingSummary.linked++;
      else if (mapping.status === 'missing') mappingSummary.missing++;
      else if (mapping.status === 'conflict') mappingSummary.conflict++;
    }

    const linkedMappingTargets = mappingTargets
      .filter((mapping) => mapping.status === 'linked')
      .map((mapping) => mapping.target);
    const agentTargets = addUnique(
      addUnique(candidate.agentTargets, installedBySkill.get(candidate.name) || []),
      linkedMappingTargets,
    );

    // Build appliedAgents from candidate's local scan, installs, and mappings
    const appliedAgents = [...candidate.appliedAgents];
    const installTargets = installedBySkill.get(candidate.name) || [];
    for (const target of installTargets) {
      if (!appliedAgents.some((a) => a.id === target)) {
        appliedAgents.push({ id: target, label: target, source: 'install' });
      }
    }
    for (const mapping of mappingTargets) {
      if (mapping.status === 'linked' && !appliedAgents.some((a) => a.id === mapping.target)) {
        appliedAgents.push({ id: mapping.target, label: mapping.target, source: 'mapping' });
      }
    }

    results.push({
      name: candidate.name,
      path: candidate.path,
      source: candidate.source,
      sourceLabel: candidate.sourceLabel,
      agentTargets,
      appliedAgents,
      mappingTargets,
      mappingSummary,
      validationStatus: validation.status,
      issues: validation.issues.map((i) => i.message),
      alreadyImported: importedNames.has(candidate.name) || candidate.source === 'skillgov-project',
    });
  }

  return { skills: results, nonSkillDirectories: scanned.nonSkillDirectories };
}

export function discoverSkills(options: DiscoveryOptions = {}): DiscoveredSkill[] {
  return discoverSkillInventory(options).skills;
}
