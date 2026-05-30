// Project diagnostics — checks project structure, registry integrity, link validity, and reports issues for repair.
import { existsSync, readlinkSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSkillMappings } from './mapping.js';
import { RegistryCorruptedError, readRegistry } from './registry.js';

export interface DoctorIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  category: 'structure' | 'registry' | 'link' | 'skill';
}

export interface DoctorReport {
  issues: DoctorIssue[];
  healthy: boolean;
}

export function runDoctor(projectRoot: string): DoctorReport {
  const issues: DoctorIssue[] = [];

  // 1. Check project structure
  const requiredDirs = ['incoming', 'skills', 'overlays', 'registry', 'tasks'];
  for (const dir of requiredDirs) {
    if (!existsSync(resolve(projectRoot, dir))) {
      issues.push({
        severity: 'warning',
        message: `Missing directory: "${dir}". Run "skillgov init" to create it.`,
        category: 'structure',
      });
    }
  }

  // 2. Check registry files
  const regFiles = ['skills.json', 'mappings.json'];
  for (const file of regFiles) {
    const regPath = resolve(projectRoot, 'registry', file);
    if (!existsSync(regPath)) {
      issues.push({
        severity: 'info',
        message: `Registry file "${file}" not found. It will be created when needed.`,
        category: 'registry',
      });
    } else {
      try {
        readRegistry(regPath, null);
      } catch (err) {
        if (err instanceof RegistryCorruptedError) {
          issues.push({
            severity: 'error',
            message: `Registry file "${file}" is corrupted: ${(err.cause as Error)?.message || 'invalid JSON'}. Delete or repair it to continue.`,
            category: 'registry',
          });
        }
      }
    }
  }

  // 3. Check for legacy installs.json and suggest migration
  const legacyInstallsPath = resolve(projectRoot, 'registry', 'installs.json');
  if (existsSync(legacyInstallsPath)) {
    issues.push({
      severity: 'info',
      message:
        'Legacy "installs.json" found. Mapping state is now stored in "mappings.json". The legacy file will be migrated automatically on first access.',
      category: 'registry',
    });
  }

  // 4. Check mapping links
  const mappingsPath = resolve(projectRoot, 'registry', 'mappings.json');
  let mappings: ReturnType<typeof readSkillMappings>;
  try {
    mappings = readSkillMappings(mappingsPath);
  } catch {
    return { issues, healthy: false };
  }
  for (const [skillName, mapping] of Object.entries(mappings.mappings)) {
    for (const [target, link] of Object.entries(mapping.links)) {
      if (!link) continue;
      if (!existsSync(link.path)) {
        issues.push({
          severity: 'warning',
          message: `Stale mapping link for "${skillName}" on "${target}": path "${link.path}" does not exist.`,
          category: 'link',
        });
      } else {
        try {
          const stat = statSync(link.path);
          if (stat.isDirectory()) {
            try {
              readlinkSync(link.path);
            } catch {
              // Not a symlink — likely a copy or regular directory, OK for copy mode
            }
          }
        } catch {
          issues.push({
            severity: 'error',
            message: `Cannot stat mapping path "${link.path}" for "${skillName}" on "${target}".`,
            category: 'link',
          });
        }
      }
    }
  }

  return {
    issues,
    healthy: issues.filter((i) => i.severity === 'error' || i.severity === 'warning').length === 0,
  };
}
