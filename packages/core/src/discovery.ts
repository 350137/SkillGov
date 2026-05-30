// Local skill discovery scans SkillGov-managed skills and all configured target profile skill directories dynamically.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathsResolveToSameLocation } from './mapping.js';
import { detectLinkType } from './mapping.js';
import { readRegistry } from './registry.js';
import type { SkillsRegistry } from './registry.js';
import type { TargetEntry } from './targets.js';
import { listTargetProfiles } from './targets.js';
import type { TargetProfile } from './targets.js';
import { validateSkill } from './validator.js';

export type AgentStateStatus =
  | 'managed-linked'
  | 'unmanaged-local'
  | 'unmapped'
  | 'missing'
  | 'conflict';

export interface AgentState {
  profileId: string;
  profileLabel: string;
  state: AgentStateStatus;
  skillDir: string;
  path: string;
  linkTarget?: string;
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
  source: 'project' | 'agent';
  sourceLabel: string;
  origin?: string;
  agentStates: AgentState[];
  mappingSummary: MappingSummary;
  validationStatus: 'pass' | 'fixable' | 'fail';
  issues: string[];
  alreadyImported: boolean;
}

export interface NonSkillDirectory {
  name: string;
  path: string;
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
  mappingsPath?: string;
  targets?: TargetEntry[];
}

const ORIGIN_LABELS: Record<string, string> = {
  local: '手动导入',
  'codex-plugin-cache': 'Codex 插件缓存',
};

interface SkillCandidate {
  name: string;
  path: string;
  source: 'project' | 'agent';
}

function scanSkillDir(
  dir: string,
  source: 'project' | 'agent',
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
    if (existsSync(join(fullPath, 'SKILL.md'))) {
      skills.push({ name: entry, path: fullPath, source });
    } else {
      nonSkillDirectories.push({ name: entry, path: fullPath, issue: 'Missing SKILL.md' });
    }
  }

  return { skills, nonSkillDirectories };
}

function mergeCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  const byName = new Map<string, SkillCandidate>();
  for (const candidate of candidates) {
    const existing = byName.get(candidate.name);
    if (!existing) {
      byName.set(candidate.name, candidate);
      continue;
    }
    // Prefer project source over agent source
    if (candidate.source === 'project' && existing.source !== 'project') {
      byName.set(candidate.name, candidate);
    }
  }
  return [...byName.values()];
}

function computeAgentStates(
  skillName: string,
  canonicalPath: string,
  profiles: TargetProfile[],
): AgentState[] {
  const states: AgentState[] = [];
  for (const profile of profiles) {
    for (const skillDir of profile.skillDirs) {
      const linkPath = join(skillDir, skillName);
      if (!existsSync(linkPath)) {
        states.push({
          profileId: profile.id,
          profileLabel: profile.label,
          state: 'unmapped',
          skillDir,
          path: linkPath,
        });
        continue;
      }

      const detection = detectLinkType(linkPath);
      if (detection.type === 'directory') {
        states.push({
          profileId: profile.id,
          profileLabel: profile.label,
          state: 'unmanaged-local',
          skillDir,
          path: linkPath,
        });
      } else if (detection.type === 'junction' || detection.type === 'symlink') {
        const linked = pathsResolveToSameLocation(linkPath, canonicalPath);
        states.push({
          profileId: profile.id,
          profileLabel: profile.label,
          state: linked ? 'managed-linked' : 'conflict',
          skillDir,
          path: linkPath,
          linkTarget: detection.target,
        });
      } else {
        states.push({
          profileId: profile.id,
          profileLabel: profile.label,
          state: 'missing',
          skillDir,
          path: linkPath,
        });
      }
    }
  }
  return states;
}

function labelForOrigin(origin?: string): string {
  if (!origin) return 'SkillGov 技能库';
  return ORIGIN_LABELS[origin] || origin;
}

export function discoverSkillInventory(options: DiscoveryOptions = {}): SkillInventory {
  const home = options.home;
  const profiles = listTargetProfiles(options.targets, home);
  const registryPath =
    options.registryPath ||
    (options.projectRoot ? join(options.projectRoot, 'registry', 'skills.json') : undefined);
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

  // Scan project skills directory
  const candidates: SkillCandidate[] = [];
  const nonSkillDirectories: NonSkillDirectory[] = [];

  if (options.projectRoot) {
    const projectScan = scanSkillDir(join(options.projectRoot, 'skills'), 'project');
    candidates.push(...projectScan.skills);
    nonSkillDirectories.push(...projectScan.nonSkillDirectories);
  }

  // Scan all target profile skill directories dynamically
  for (const profile of profiles) {
    for (const skillDir of profile.skillDirs) {
      const scan = scanSkillDir(skillDir, 'agent');
      candidates.push(...scan.skills);
      nonSkillDirectories.push(...scan.nonSkillDirectories);
    }
  }

  const merged = mergeCandidates(candidates);
  const results: DiscoveredSkill[] = [];

  for (const candidate of merged) {
    const validation = validateSkill(candidate.path);
    const canonicalPath =
      candidate.source === 'project'
        ? candidate.path
        : options.projectRoot
          ? join(options.projectRoot, 'skills', candidate.name)
          : candidate.path;
    const agentStates = computeAgentStates(candidate.name, canonicalPath, profiles);

    const mappingSummary: MappingSummary = { total: 0, linked: 0, missing: 0, conflict: 0 };
    for (const state of agentStates) {
      if (
        state.state === 'managed-linked' ||
        state.state === 'missing' ||
        state.state === 'conflict'
      ) {
        mappingSummary.total++;
        if (state.state === 'managed-linked') mappingSummary.linked++;
        else if (state.state === 'missing') mappingSummary.missing++;
        else if (state.state === 'conflict') mappingSummary.conflict++;
      }
    }

    const origin = importedOrigins.get(candidate.name);
    const sourceLabel =
      candidate.source === 'project' ? labelForOrigin(origin) : `${candidate.source}`;

    results.push({
      name: candidate.name,
      path: candidate.path,
      source: candidate.source,
      sourceLabel,
      origin,
      agentStates,
      mappingSummary,
      validationStatus: validation.status,
      issues: validation.issues.map((i) => i.message),
      alreadyImported: importedNames.has(candidate.name) || candidate.source === 'project',
    });
  }

  return { skills: results, nonSkillDirectories };
}

export function discoverSkills(options: DiscoveryOptions = {}): DiscoveredSkill[] {
  return discoverSkillInventory(options).skills;
}
