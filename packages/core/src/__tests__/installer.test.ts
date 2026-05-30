// Tests for installer module — install, uninstall, rollback, and compatibility blocking.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type InstallOptions,
  installSkill,
  rollbackLastInstall,
  uninstallSkill,
} from '../installer.js';
import { readSkillMappings } from '../mapping.js';
import { writeRegistry } from '../registry.js';
import type { TargetProfile } from '../targets.js';

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

    // Verify mapping was updated
    const mappings = readSkillMappings(options.mappingsPath);
    expect(mappings.mappings['test-skill']).toBeDefined();
    expect(mappings.mappings['test-skill'].links.claude).toBeDefined();
    expect(mappings.mappings['test-skill'].links.claude?.type).toBe('standard');
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

  it('blocks standard install when the skill requires a target overlay', () => {
    const skillDir = join(tmpDir, 'skills', 'claude-only-standard');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: claude-only-standard\ndescription: blocked\ncompatibility: claude-only\n---\n\nBlocked.\n',
      'utf-8',
    );
    const options = makeOptions();
    const result = installSkill('claude-only-standard', 'codex', 'copy', options);
    expect(result.status).toBe('blocked');
    expect(result.message).toContain('needs-overlay');
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
    // Verify overlay type in mappings
    const mappings = readSkillMappings(options.mappingsPath);
    expect(mappings.mappings['test-skill'].links.codex?.type).toBe('overlay');
  });

  it('installs a standard skill to a custom target via mapping logic', () => {
    const options = makeOptions();
    const result = installSkill('test-skill', 'opencode', 'copy', options);
    expect(result.status).toBe('installed');
    expect(result.targetName).toBe('opencode');
    expect(existsSync(join(tmpDir, 'target-skills', 'test-skill', 'SKILL.md'))).toBe(true);

    // Verify mapping was written
    const mappings = readSkillMappings(options.mappingsPath);
    expect(mappings.mappings['test-skill']).toBeDefined();
    expect(mappings.mappings['test-skill'].links.opencode).toBeDefined();
    expect(mappings.mappings['test-skill'].links.opencode?.type).toBe('standard');
    expect(mappings.mappings['test-skill'].links.opencode?.path).toBe(
      join(tmpDir, 'target-skills', 'test-skill'),
    );
  });

  it('installs to a configured custom target profile without targetSkillRoot override', () => {
    const targetSkillRoot = join(tmpDir, 'configured-opencode-skills');
    const targetProfiles: TargetProfile[] = [
      {
        id: 'opencode',
        label: 'OpenCode',
        skillDirs: [targetSkillRoot],
        linkMode: 'copy',
        supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
      },
    ];
    const options: InstallOptions = {
      projectRoot: tmpDir,
      operationsPath: join(tmpDir, 'registry', 'operations.jsonl'),
      mappingsPath: join(tmpDir, 'registry', 'mappings.json'),
      targetProfiles,
    };

    const result = installSkill('test-skill', 'opencode', 'copy', options);

    expect(result.status).toBe('installed');
    expect(result.linkPath).toBe(join(targetSkillRoot, 'test-skill'));
    expect(existsSync(join(targetSkillRoot, 'test-skill', 'SKILL.md'))).toBe(true);

    const mappings = readSkillMappings(options.mappingsPath);
    expect(mappings.mappings['test-skill'].links.opencode?.path).toBe(
      join(targetSkillRoot, 'test-skill'),
    );
  });

  it('uses configured target capabilities when checking install compatibility', () => {
    const skillDir = join(tmpDir, 'skills', 'agent-bound');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: agent-bound\ndescription: agent bound\nagent: Explore\n---\n\nContent.\n',
      'utf-8',
    );
    const targetProfiles: TargetProfile[] = [
      {
        id: 'plain',
        label: 'Plain Tool',
        skillDirs: [join(tmpDir, 'plain-skills')],
        linkMode: 'copy',
        supports: {
          skillMd: true,
          allowedTools: 'partial',
          scripts: 'unknown',
          agents: 'none',
        },
      },
    ];
    const options: InstallOptions = {
      projectRoot: tmpDir,
      operationsPath: join(tmpDir, 'registry', 'operations.jsonl'),
      mappingsPath: join(tmpDir, 'registry', 'mappings.json'),
      targetProfiles,
    };

    const result = installSkill('agent-bound', 'plain', 'copy', options);

    expect(result.status).toBe('blocked');
    expect(result.message).toContain('needs-overlay');
  });
});

describe('uninstallSkill', () => {
  it('uninstalls a previously installed skill', () => {
    const options = makeOptions();
    installSkill('test-skill', 'claude', 'copy', options);
    const result = uninstallSkill('test-skill', 'claude', options);
    expect(result.skillName).toBe('test-skill');
    // Verify removed from mappings
    const mappings = readSkillMappings(options.mappingsPath);
    expect(mappings.mappings['test-skill']?.links.claude).toBeUndefined();
  });

  it('returns not-found for non-installed skill', () => {
    const options = makeOptions();
    const result = uninstallSkill('never-installed', 'claude', options);
    expect(result.status).toBe('not-found');
  });

  it('refuses to delete linkPath outside known target skill directories', () => {
    const options = makeOptions();
    // Write a corrupted mapping record with an arbitrary path
    writeRegistry(options.mappingsPath, {
      mappings: {
        'evil-skill': {
          skillName: 'evil-skill',
          canonicalPath: join(tmpDir, 'skills', 'evil-skill'),
          links: {
            claude: {
              path: join(tmpDir, 'important-data'),
              mode: 'copy',
              status: 'linked',
              type: 'standard',
              updatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        },
      },
    });
    mkdirSync(join(tmpDir, 'important-data'), { recursive: true });

    const result = uninstallSkill('evil-skill', 'claude', options);
    expect(result.status).toBe('not-found');
    expect(result.message).toContain('Refusing to delete');
    expect(existsSync(join(tmpDir, 'important-data'))).toBe(true);
  });

  it('refuses to delete when linkPath equals the target skill root directory', () => {
    const options = makeOptions();
    const targetRoot = join(tmpDir, 'target-skills');
    mkdirSync(targetRoot, { recursive: true });
    writeFileSync(join(targetRoot, 'keep.txt'), 'important', 'utf-8');
    // Corrupt mapping: linkPath points to the root itself, not a child
    writeRegistry(options.mappingsPath, {
      mappings: {
        'root-attack': {
          skillName: 'root-attack',
          canonicalPath: join(tmpDir, 'skills', 'root-attack'),
          links: {
            claude: {
              path: targetRoot,
              mode: 'copy',
              status: 'linked',
              type: 'standard',
              updatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const result = uninstallSkill('root-attack', 'claude', options);
    expect(result.status).toBe('not-found');
    expect(result.message).toContain('Refusing to delete');
    expect(existsSync(targetRoot)).toBe(true);
    expect(existsSync(join(targetRoot, 'keep.txt'))).toBe(true);
  });

  it('refuses to delete a different skill directory under the target root', () => {
    const options = makeOptions();
    const otherSkillDir = join(tmpDir, 'target-skills', 'other-skill');
    mkdirSync(otherSkillDir, { recursive: true });
    writeFileSync(join(otherSkillDir, 'keep.txt'), 'important', 'utf-8');
    writeRegistry(options.mappingsPath, {
      mappings: {
        'evil-skill': {
          skillName: 'evil-skill',
          canonicalPath: join(tmpDir, 'skills', 'evil-skill'),
          links: {
            claude: {
              path: otherSkillDir,
              mode: 'copy',
              status: 'linked',
              type: 'standard',
              updatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const result = uninstallSkill('evil-skill', 'claude', options);
    expect(result.status).toBe('not-found');
    expect(result.message).toContain('Refusing to delete');
    expect(existsSync(otherSkillDir)).toBe(true);
    expect(existsSync(join(otherSkillDir, 'keep.txt'))).toBe(true);
  });
});

describe('rollbackLastInstall', () => {
  it('rolls back the last install for a target', () => {
    const options = makeOptions();
    installSkill('test-skill', 'claude', 'copy', options);
    const result = rollbackLastInstall('claude', options);
    expect(result).not.toBeNull();
    expect(result?.skillName).toBe('test-skill');
    // Verify removed from mappings
    const mappings = readSkillMappings(options.mappingsPath);
    expect(mappings.mappings['test-skill']?.links.claude).toBeUndefined();
  });

  it('returns not-found when no install exists', () => {
    const options = makeOptions();
    const result = rollbackLastInstall('codex', options);
    expect(result?.status).toBe('not-found');
  });
});
