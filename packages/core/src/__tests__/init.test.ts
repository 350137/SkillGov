// Tests for project initialisation — directory creation, config writing, and dry-run mode.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for project initialisation — directory structure, config file creation, idempotency.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initProject } from '../init.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-test-init-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('initProject', () => {
  it('creates all required directories', () => {
    initProject(tmpDir, { dryRun: false });
    const expectedDirs = [
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
    for (const dir of expectedDirs) {
      expect(existsSync(join(tmpDir, dir))).toBe(true);
    }
  });

  it('creates skillgov.config.json', () => {
    initProject(tmpDir, { dryRun: false });
    const configPath = join(tmpDir, 'skillgov.config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.projectRoot).toBe(tmpDir.replace(/\\/g, '/'));
    expect(config.defaultLinkMode).toBe('junction');
    expect(config.targets).toEqual(['claude', 'codex']);
  });

  it('creates empty registry files', () => {
    initProject(tmpDir, { dryRun: false });
    expect(existsSync(join(tmpDir, 'registry/skills.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'registry/mappings.json'))).toBe(true);
    const skills = JSON.parse(readFileSync(join(tmpDir, 'registry/skills.json'), 'utf-8'));
    expect(skills.skills).toEqual({});
    const mappings = JSON.parse(readFileSync(join(tmpDir, 'registry/mappings.json'), 'utf-8'));
    expect(mappings.mappings).toEqual({});
  });

  it('does nothing when dryRun is true', () => {
    initProject(tmpDir, { dryRun: true });
    expect(readdirSync(tmpDir)).toHaveLength(0);
  });

  it('is safe to call twice (idempotent)', () => {
    initProject(tmpDir, { dryRun: false });
    initProject(tmpDir, { dryRun: false });
    const configPath = join(tmpDir, 'skillgov.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.projectRoot).toBe(tmpDir.replace(/\\/g, '/'));
  });
});
