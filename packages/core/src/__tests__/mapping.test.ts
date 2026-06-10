// Tests for managed skill mapping links that keep agent skill directories pointing at SkillGov-owned skills.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  linkManagedSkillToAgent,
  readSkillMappings,
  removeMappingLink,
  upsertMapping,
} from '../mapping.js';
import type { SkillMappingLink } from '../registry.js';
import type { TargetProfile } from '../targets.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-mapping-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createManagedSkill(name: string): string {
  const dir = join(tmpDir, 'project', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: mapped skill\n---\n\n# ${name}\n`,
    'utf-8',
  );
  return dir;
}

describe('linkManagedSkillToAgent', () => {
  it('backs up an existing agent skill directory before replacing it with a managed link', () => {
    createManagedSkill('ab');
    const targetSkillRoot = join(tmpDir, 'codex-skills');
    const original = join(targetSkillRoot, 'ab');
    mkdirSync(original, { recursive: true });
    writeFileSync(join(original, 'SKILL.md'), 'original', 'utf-8');

    const result = linkManagedSkillToAgent('ab', 'codex', {
      projectRoot: join(tmpDir, 'project'),
      mappingsPath: join(tmpDir, 'project', 'registry', 'mappings.json'),
      targetSkillRoot,
      backupsRoot: join(tmpDir, 'project', 'backups'),
    });

    expect(result.status).toBe('linked');
    expect(result.backupPath).toBeDefined();
    expect(existsSync(join(result.backupPath || '', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(original, 'SKILL.md'), 'utf-8')).toContain('mapped skill');

    const mappings = readSkillMappings(join(tmpDir, 'project', 'registry', 'mappings.json'));
    expect(mappings.mappings.ab.canonicalPath).toBe(join(tmpDir, 'project', 'skills', 'ab'));
    expect(mappings.mappings.ab.links.codex?.path).toBe(original);
    expect(mappings.mappings.ab.links.codex?.mode).toBe('junction');
    expect(mappings.mappings.ab.links.codex?.status).toBe('linked');
  });

  it('creates an agent link when the original agent skill directory is missing', () => {
    createManagedSkill('missing-original');
    const targetSkillRoot = join(tmpDir, 'claude-skills');
    const linkPath = join(targetSkillRoot, 'missing-original');

    const result = linkManagedSkillToAgent('missing-original', 'claude', {
      projectRoot: join(tmpDir, 'project'),
      mappingsPath: join(tmpDir, 'project', 'registry', 'mappings.json'),
      targetSkillRoot,
      backupsRoot: join(tmpDir, 'project', 'backups'),
    });

    expect(result.status).toBe('linked');
    expect(result.backupPath).toBeUndefined();
    expect(readFileSync(join(linkPath, 'SKILL.md'), 'utf-8')).toContain('missing-original');
  });

  it('refuses to map a managed directory that is missing SKILL.md', () => {
    mkdirSync(join(tmpDir, 'project', 'skills', 'not-skill'), { recursive: true });

    const result = linkManagedSkillToAgent('not-skill', 'codex', {
      projectRoot: join(tmpDir, 'project'),
      mappingsPath: join(tmpDir, 'project', 'registry', 'mappings.json'),
      targetSkillRoot: join(tmpDir, 'codex-skills'),
      backupsRoot: join(tmpDir, 'project', 'backups'),
    });

    expect(result.status).toBe('not-found');
  });

  it('links a skill to a custom target (opencode) and writes to mappings registry', () => {
    createManagedSkill('custom-skill');
    const targetSkillRoot = join(tmpDir, 'opencode-skills');

    const result = linkManagedSkillToAgent('custom-skill', 'opencode', {
      projectRoot: join(tmpDir, 'project'),
      mappingsPath: join(tmpDir, 'project', 'registry', 'mappings.json'),
      targetSkillRoot,
      linkMode: 'junction',
    });

    expect(result.status).toBe('linked');
    expect(result.targetName).toBe('opencode');
    expect(existsSync(join(targetSkillRoot, 'custom-skill', 'SKILL.md'))).toBe(true);

    const mappings = readSkillMappings(join(tmpDir, 'project', 'registry', 'mappings.json'));
    expect(mappings.mappings['custom-skill'].links.opencode?.path).toBe(
      join(targetSkillRoot, 'custom-skill'),
    );
    expect(mappings.mappings['custom-skill'].links.opencode?.status).toBe('linked');
  });

  it('resolves configured custom target profiles when no test override path is provided', () => {
    createManagedSkill('configured-skill');
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

    const result = linkManagedSkillToAgent('configured-skill', 'opencode', {
      projectRoot: join(tmpDir, 'project'),
      mappingsPath: join(tmpDir, 'project', 'registry', 'mappings.json'),
      targetProfiles,
    });

    expect(result.status).toBe('linked');
    expect(result.linkPath).toBe(join(targetSkillRoot, 'configured-skill'));
    expect(existsSync(join(targetSkillRoot, 'configured-skill', 'SKILL.md'))).toBe(true);
  });
});

describe('upsertMapping', () => {
  it('normalises legacy mappings without links wrapper', () => {
    const mappingsPath = join(tmpDir, 'registry', 'mappings.json');
    mkdirSync(join(tmpDir, 'registry'), { recursive: true });
    writeFileSync(
      mappingsPath,
      JSON.stringify({
        mappings: {
          legacy: {
            codex: {
              path: join(tmpDir, 'codex-skills', 'legacy'),
              mode: 'junction',
              status: 'linked',
              type: 'standard',
              linkedAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            claude: {
              path: join(tmpDir, 'claude-skills', 'legacy'),
              mode: 'junction',
              status: 'missing',
              updatedAt: '2025-01-02T00:00:00Z',
            },
          },
        },
      }),
      'utf-8',
    );

    const mappings = readSkillMappings(mappingsPath);

    expect(mappings.mappings.legacy.skillName).toBe('legacy');
    expect(mappings.mappings.legacy.links.codex?.type).toBe('standard');
    expect(mappings.mappings.legacy.links.claude?.status).toBe('missing');
  });

  it('creates a new mapping entry when none exists', () => {
    const mappingsPath = join(tmpDir, 'registry', 'mappings.json');
    const link: SkillMappingLink = {
      path: join(tmpDir, 'codex-skills', 'my-skill'),
      mode: 'junction',
      status: 'linked',
      type: 'standard',
      linkedAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    upsertMapping(mappingsPath, 'my-skill', join(tmpDir, 'skills', 'my-skill'), 'codex', link);

    const mappings = readSkillMappings(mappingsPath);
    expect(mappings.mappings['my-skill']).toBeDefined();
    expect(mappings.mappings['my-skill'].canonicalPath).toBe(join(tmpDir, 'skills', 'my-skill'));
    expect(mappings.mappings['my-skill'].links.codex?.path).toBe(link.path);
    expect(mappings.mappings['my-skill'].links.codex?.type).toBe('standard');
  });

  it('adds a new target link to an existing mapping', () => {
    const mappingsPath = join(tmpDir, 'registry', 'mappings.json');
    const link1: SkillMappingLink = {
      path: join(tmpDir, 'codex-skills', 'my-skill'),
      mode: 'junction',
      status: 'linked',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const link2: SkillMappingLink = {
      path: join(tmpDir, 'claude-skills', 'my-skill'),
      mode: 'copy',
      status: 'linked',
      updatedAt: '2025-01-02T00:00:00Z',
    };
    upsertMapping(mappingsPath, 'my-skill', join(tmpDir, 'skills', 'my-skill'), 'codex', link1);
    upsertMapping(mappingsPath, 'my-skill', join(tmpDir, 'skills', 'my-skill'), 'claude', link2);

    const mappings = readSkillMappings(mappingsPath);
    expect(Object.keys(mappings.mappings['my-skill'].links)).toEqual(['codex', 'claude']);
    expect(mappings.mappings['my-skill'].links.claude?.mode).toBe('copy');
  });
});

describe('removeMappingLink', () => {
  it('removes a specific target link from a mapping', () => {
    const mappingsPath = join(tmpDir, 'registry', 'mappings.json');
    const link: SkillMappingLink = {
      path: join(tmpDir, 'codex-skills', 'my-skill'),
      mode: 'junction',
      status: 'linked',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    upsertMapping(mappingsPath, 'my-skill', join(tmpDir, 'skills', 'my-skill'), 'codex', link);
    upsertMapping(mappingsPath, 'my-skill', join(tmpDir, 'skills', 'my-skill'), 'claude', link);

    const removed = removeMappingLink(mappingsPath, 'my-skill', 'codex');
    expect(removed).toBe(true);

    const mappings = readSkillMappings(mappingsPath);
    expect(mappings.mappings['my-skill'].links.codex).toBeUndefined();
    expect(mappings.mappings['my-skill'].links.claude).toBeDefined();
  });

  it('removes the entire mapping when the last link is deleted', () => {
    const mappingsPath = join(tmpDir, 'registry', 'mappings.json');
    const link: SkillMappingLink = {
      path: join(tmpDir, 'codex-skills', 'my-skill'),
      mode: 'junction',
      status: 'linked',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    upsertMapping(mappingsPath, 'my-skill', join(tmpDir, 'skills', 'my-skill'), 'codex', link);

    const removed = removeMappingLink(mappingsPath, 'my-skill', 'codex');
    expect(removed).toBe(true);

    const mappings = readSkillMappings(mappingsPath);
    expect(mappings.mappings['my-skill']).toBeUndefined();
  });

  it('returns false when the skill or target does not exist', () => {
    const mappingsPath = join(tmpDir, 'registry', 'mappings.json');
    expect(removeMappingLink(mappingsPath, 'nonexistent', 'codex')).toBe(false);
  });
});
