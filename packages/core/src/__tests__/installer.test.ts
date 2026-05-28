// Tests for installer module — install, uninstall, rollback, and compatibility blocking.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type InstallOptions,
  installSkill,
  rollbackLastInstall,
  uninstallSkill,
} from '../installer.js';
import { readRegistry } from '../registry.js';
import type { InstallsRegistry } from '../registry.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-install-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  // Create project structure
  mkdirSync(join(tmpDir, 'skills', 'test-skill'), { recursive: true });
  writeFileSync(
    join(tmpDir, 'skills', 'test-skill', 'SKILL.md'),
    '---\nname: test-skill\ndescription: a test skill\n---\n\nContent.\n',
    'utf-8',
  );
  mkdirSync(join(tmpDir, 'registry'), { recursive: true });
  mkdirSync(join(tmpDir, 'overlays'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeOptions(): InstallOptions {
  return {
    projectRoot: tmpDir,
    registryPath: join(tmpDir, 'registry', 'installs.json'),
    operationsPath: join(tmpDir, 'registry', 'operations.jsonl'),
    mappingsPath: join(tmpDir, 'registry', 'mappings.json'),
    targetSkillRoot: join(tmpDir, 'target-skills'),
  };
}

describe('installSkill', () => {
  it('installs a skill using copy mode', () => {
    // Patch target profile — we need a valid target dir
    // We test through copy mode by specifying it directly
    const options = makeOptions();
    // For test, we use a custom target dir by manipulating the profile
    const result = installSkill('test-skill', 'claude', 'copy', options);
    // Since ~/.claude/skills likely doesn't exist, it'll still try — but we check the logic
    expect(result.status).toBe('installed');
    expect(result.skillName).toBe('test-skill');
    expect(result.targetName).toBe('claude');
    expect(result.linkPath).toBe(join(tmpDir, 'target-skills', 'test-skill'));
    expect(existsSync(join(tmpDir, 'target-skills', 'test-skill', 'SKILL.md'))).toBe(true);

    // Verify registry was updated
    const installs = readRegistry<InstallsRegistry>(options.registryPath, { installs: {} });
    expect(installs.installs['test-skill@claude']).toBeDefined();
    expect(installs.installs['test-skill@claude'].type).toBe('standard');
  });

  it('returns not-found for missing skill', () => {
    const options = makeOptions();
    const result = installSkill('nonexistent', 'claude', 'copy', options);
    expect(result.status).toBe('not-found');
  });

  it('returns blocked for unsupported skill', () => {
    const skillDir = join(tmpDir, 'skills', 'blocked-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: blocked-skill\ndescription: blocked\ndependencies: "[]"\ncompatibility: unsupported\n---\n\nBlocked.\n',
      'utf-8',
    );
    const options = makeOptions();
    const result = installSkill('blocked-skill', 'claude', 'copy', options);
    expect(result.status).toBe('blocked');
  });

  it('logs an install operation', () => {
    const options = makeOptions();
    const result = installSkill('test-skill', 'claude', 'copy', options);
    expect(result.operation).toBeDefined();
    expect(result.operation?.action).toBe('install');
    expect(result.operation?.status).toBe('completed');
  });

  it('installs from overlay when it exists', () => {
    // Create overlay
    mkdirSync(join(tmpDir, 'overlays', 'codex', 'test-skill'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'overlays', 'codex', 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: codex overlay\n---\n\nOverlay.\n',
      'utf-8',
    );
    const options = makeOptions();
    const result = installSkill('test-skill', 'codex', 'copy', options);
    expect(result.status).toBe('installed');
    expect(result.linkPath).toBe(join(tmpDir, 'target-skills', 'test-skill'));
    expect(existsSync(join(tmpDir, 'target-skills', 'test-skill', 'SKILL.md'))).toBe(true);
    // Verify overlay type
    const installs = readRegistry<InstallsRegistry>(options.registryPath, { installs: {} });
    expect(installs.installs['test-skill@codex'].type).toBe('overlay');
  });

  it('installs a standard skill to a custom target via mapping logic', () => {
    const options = makeOptions();
    const result = installSkill('test-skill', 'opencode', 'copy', options);
    expect(result.status).toBe('installed');
    expect(result.targetName).toBe('opencode');
    expect(existsSync(join(tmpDir, 'target-skills', 'test-skill', 'SKILL.md'))).toBe(true);

    // Verify install record
    const installs = readRegistry<InstallsRegistry>(options.registryPath, { installs: {} });
    expect(installs.installs['test-skill@opencode']).toBeDefined();
    expect(installs.installs['test-skill@opencode'].type).toBe('standard');

    // Verify mapping was written
    const mappings = JSON.parse(readFileSync(join(tmpDir, 'registry', 'mappings.json'), 'utf-8'));
    expect(mappings.mappings['test-skill']).toBeDefined();
    expect(mappings.mappings['test-skill'].links.opencode).toBeDefined();
    expect(mappings.mappings['test-skill'].links.opencode.path).toBe(
      join(tmpDir, 'target-skills', 'test-skill'),
    );
  });
});

describe('uninstallSkill', () => {
  it('uninstalls a previously installed skill', () => {
    const options = makeOptions();
    installSkill('test-skill', 'claude', 'copy', options);
    const result = uninstallSkill('test-skill', 'claude', options);
    expect(result.skillName).toBe('test-skill');
    // Verify removed from registry
    const installs = readRegistry<InstallsRegistry>(options.registryPath, { installs: {} });
    expect(installs.installs['test-skill@claude']).toBeUndefined();
  });

  it('returns not-found for non-installed skill', () => {
    const options = makeOptions();
    const result = uninstallSkill('never-installed', 'claude', options);
    expect(result.status).toBe('not-found');
  });
});

describe('rollbackLastInstall', () => {
  it('rolls back the last install for a target', () => {
    const options = makeOptions();
    installSkill('test-skill', 'claude', 'copy', options);
    const result = rollbackLastInstall('claude', options);
    expect(result).not.toBeNull();
    expect(result?.skillName).toBe('test-skill');
    // Verify removed from registry
    const installs = readRegistry<InstallsRegistry>(options.registryPath, { installs: {} });
    expect(installs.installs['test-skill@claude']).toBeUndefined();
  });

  it('returns not-found when no install exists', () => {
    const options = makeOptions();
    const result = rollbackLastInstall('codex', options);
    expect(result?.status).toBe('not-found');
  });
});
