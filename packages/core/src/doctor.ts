// Project diagnostics — checks project structure, registry integrity, link validity, and reports issues for repair.
import { existsSync, readlinkSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { RegistryCorruptedError, readRegistry } from './registry.js';
import type { InstallsRegistry } from './registry.js';

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
  const regFiles = ['skills.json', 'installs.json', 'compatibility.json'];
  for (const file of regFiles) {
    const regPath = resolve(projectRoot, 'registry', file);
    if (!existsSync(regPath)) {
      issues.push({
        severity: 'info',
        message: `Registry file "${file}" not found. It will be created when needed.`,
        category: 'registry',
      });
    } else {
      // Check if the file is valid JSON
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

  // 3. Check install links
  const installsPath = resolve(projectRoot, 'registry', 'installs.json');
  const installsReg = readRegistry<InstallsRegistry>(installsPath, { installs: {} });
  for (const [key, record] of Object.entries(installsReg.installs)) {
    if (!existsSync(record.linkPath)) {
      issues.push({
        severity: 'warning',
        message: `Stale install link for "${key}": target path "${record.linkPath}" does not exist.`,
        category: 'link',
      });
    } else {
      // Check if it's actually a link (junction/symlink) by trying readlink
      try {
        const stat = statSync(record.linkPath);
        if (stat.isDirectory()) {
          try {
            readlinkSync(record.linkPath);
          } catch {
            // Not a symlink — likely a copy or regular directory, this is OK for copy mode
          }
        }
      } catch {
        issues.push({
          severity: 'error',
          message: `Cannot stat install path "${record.linkPath}" for "${key}".`,
          category: 'link',
        });
      }
    }
  }

  return {
    issues,
    healthy: issues.filter((i) => i.severity === 'error' || i.severity === 'warning').length === 0,
  };
}
