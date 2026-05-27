// Local skill discovery — scans Codex user, Claude user, and Codex plugin cache directories for skills and reports their validation status.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readRegistry } from './registry.js';
import type { SkillsRegistry } from './registry.js';
import { validateSkill } from './validator.js';

export interface DiscoveredSkill {
  name: string;
  path: string;
  source: 'codex-user' | 'claude-user' | 'codex-plugin-cache';
  sourceTarget: string;
  validationStatus: 'pass' | 'fixable' | 'fail';
  issues: string[];
  alreadyImported: boolean;
}

export interface DiscoveryOptions {
  home?: string;
  registryPath?: string;
}

const SOURCE_TARGET_LABELS: Record<DiscoveredSkill['source'], string> = {
  'codex-user': 'Codex 本地',
  'claude-user': 'Claude 本地',
  'codex-plugin-cache': 'Codex 插件缓存',
};

function scanSkillDir(
  dir: string,
  source: DiscoveredSkill['source'],
): Array<{ name: string; path: string; source: DiscoveredSkill['source']; sourceTarget: string }> {
  const results: Array<{
    name: string;
    path: string;
    source: DiscoveredSkill['source'];
    sourceTarget: string;
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
        sourceTarget: SOURCE_TARGET_LABELS[source],
      });
    }
  }

  return results;
}

function scanPluginCache(
  cacheDir: string,
): Array<{ name: string; path: string; source: DiscoveredSkill['source']; sourceTarget: string }> {
  const results: Array<{
    name: string;
    path: string;
    source: DiscoveredSkill['source'];
    sourceTarget: string;
  }> = [];
  if (!existsSync(cacheDir)) return results;

  // Walk: cache/<org>/<plugin>/<version>/skills/<skill>/
  let orgs: string[];
  try {
    orgs = readdirSync(cacheDir);
  } catch {
    return results;
  }

  for (const org of orgs) {
    const orgDir = join(cacheDir, org);
    try {
      if (!statSync(orgDir).isDirectory()) continue;
    } catch {
      continue;
    }

    let plugins: string[];
    try {
      plugins = readdirSync(orgDir);
    } catch {
      continue;
    }

    for (const plugin of plugins) {
      const pluginDir = join(orgDir, plugin);
      try {
        if (!statSync(pluginDir).isDirectory()) continue;
      } catch {
        continue;
      }

      let versions: string[];
      try {
        versions = readdirSync(pluginDir);
      } catch {
        continue;
      }

      for (const version of versions) {
        const skillsDir = join(pluginDir, version, 'skills');
        try {
          if (!statSync(skillsDir).isDirectory()) continue;
        } catch {
          continue;
        }

        let skills: string[];
        try {
          skills = readdirSync(skillsDir);
        } catch {
          continue;
        }

        for (const skill of skills) {
          const skillDir = join(skillsDir, skill);
          try {
            if (statSync(skillDir).isDirectory()) {
              results.push({
                name: skill,
                path: resolve(skillDir),
                source: 'codex-plugin-cache',
                sourceTarget: SOURCE_TARGET_LABELS['codex-plugin-cache'],
              });
            }
          } catch {
            // skip unreadable entry
          }
        }
      }
    }
  }

  return results;
}

function hasLatestSegment(path: string): boolean {
  return path.split(/[\\/]/).includes('latest');
}

function dedupePluginCacheCandidates(
  candidates: Array<{
    name: string;
    path: string;
    source: DiscoveredSkill['source'];
    sourceTarget: string;
  }>,
): Array<{ name: string; path: string; source: DiscoveredSkill['source']; sourceTarget: string }> {
  const pluginSkills = new Map<
    string,
    { name: string; path: string; source: DiscoveredSkill['source']; sourceTarget: string }
  >();
  const results: Array<{
    name: string;
    path: string;
    source: DiscoveredSkill['source'];
    sourceTarget: string;
  }> = [];

  for (const candidate of candidates) {
    if (candidate.source !== 'codex-plugin-cache') {
      results.push(candidate);
      continue;
    }

    const existing = pluginSkills.get(candidate.name);
    if (!existing || (!hasLatestSegment(existing.path) && hasLatestSegment(candidate.path))) {
      pluginSkills.set(candidate.name, candidate);
    }
  }

  return [...results, ...pluginSkills.values()];
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

  const candidates = dedupePluginCacheCandidates([
    ...scanSkillDir(join(home, '.codex', 'skills'), 'codex-user'),
    ...scanSkillDir(join(home, '.claude', 'skills'), 'claude-user'),
    ...scanPluginCache(join(home, '.codex', 'plugins', 'cache')),
  ]);

  const results: DiscoveredSkill[] = [];

  for (const candidate of candidates) {
    const validation = validateSkill(candidate.path);
    results.push({
      name: candidate.name,
      path: candidate.path,
      source: candidate.source,
      sourceTarget: candidate.sourceTarget,
      validationStatus: validation.status,
      issues: validation.issues.map((i) => i.message),
      alreadyImported: importedNames.has(candidate.name),
    });
  }

  return results;
}
