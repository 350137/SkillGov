// Tests for Phase 2 mapping behaviors — detectLinkType, mapSkill, unmapSkill, adoptSkill.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adoptSkill, detectLinkType, mapSkill, readSkillMappings, unmapSkill } from '../mapping.js';

let tmpDir: string;
const WINDOWS_LINK_TEST_TIMEOUT = process.platform === 'win32' ? 20_000 : 5_000;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-map2-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSkill(name: string): string {
  const dir = join(tmpDir, 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: test\n---\n\n# ${name}\n`,
    'utf-8',
  );
  return dir;
}

function mappingsPath(): string {
  return join(tmpDir, 'registry', 'mappings.json');
}

function targetRoot(): string {
  return join(tmpDir, 'agent-skills');
}

describe('detectLinkType', () => {
  it('returns missing for a nonexistent path', () => {
    expect(detectLinkType(join(tmpDir, 'nope'))).toEqual({ type: 'missing' });
  });

  it('returns directory for a plain directory', () => {
    const dir = join(tmpDir, 'plain');
    mkdirSync(dir);
    expect(detectLinkType(dir)).toEqual({ type: 'directory' });
  });

  it('returns junction with target for a junction', () => {
    const source = join(tmpDir, 'source');
    const link = join(tmpDir, 'link');
    mkdirSync(source);
    symlinkSync(source, link, 'junction');
    const result = detectLinkType(link);
    expect(result.type).toBe('junction');
    expect(result.target).toBe(source);
  });

  it('detects a link pointing to a directory as junction', () => {
    const source = join(tmpDir, 'source');
    const link = join(tmpDir, 'link');
    mkdirSync(source);
    symlinkSync(source, link, 'junction');
    const result = detectLinkType(link);
    expect(['junction', 'symlink']).toContain(result.type);
    expect(result.target).toBe(source);
  });
});

describe('mapSkill', () => {
  it('creates a junction and records in mappings.json', () => {
    createSkill('alpha');
    const result = mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });

    expect(result.status).toBe('mapped');
    expect(result.linkPath).toBe(join(targetRoot(), 'alpha'));
    expect(existsSync(join(targetRoot(), 'alpha', 'SKILL.md'))).toBe(true);

    const mappings = readSkillMappings(mappingsPath());
    expect(mappings.mappings.alpha).toBeDefined();
    expect(mappings.mappings.alpha.links.codex?.mode).toBe('junction');
    expect(mappings.mappings.alpha.links.codex?.type).toBe('standard');
  });

  it('returns not-found when skill has no SKILL.md', () => {
    mkdirSync(join(tmpDir, 'skills', 'empty'), { recursive: true });
    const result = mapSkill('empty', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });
    expect(result.status).toBe('not-found');
  });

  it('returns blocked when target is unknown', () => {
    createSkill('alpha');
    const result = mapSkill('alpha', 'unknown', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
    });
    expect(result.status).toBe('blocked');
    expect(result.message).toContain('Unknown target');
  });

  it('returns already-mapped when link already points to canonical', () => {
    createSkill('alpha');
    mkdirSync(targetRoot(), { recursive: true });
    symlinkSync(join(tmpDir, 'skills', 'alpha'), join(targetRoot(), 'alpha'), 'junction');

    const result = mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });
    expect(result.status).toBe('already-mapped');
  });

  it('refuses to map when target is a plain directory (must adopt first)', () => {
    createSkill('alpha');
    const existing = join(targetRoot(), 'alpha');
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, 'old.txt'), 'old content', 'utf-8');

    const result = mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
      backupsRoot: join(tmpDir, 'backups'),
    });

    expect(result.status).toBe('blocked');
    expect(result.message).toContain('plain directory');
    expect(result.message).toContain('adoptSkill');
    // Original directory is untouched
    expect(existsSync(join(existing, 'old.txt'))).toBe(true);
  });

  it('refuses to map when target is a conflicting external link', () => {
    createSkill('alpha');
    const otherDir = join(tmpDir, 'other-skills', 'alpha');
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, 'SKILL.md'), 'other', 'utf-8');
    mkdirSync(targetRoot(), { recursive: true });
    symlinkSync(otherDir, join(targetRoot(), 'alpha'), 'junction');

    const result = mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
      backupsRoot: join(tmpDir, 'backups'),
    });

    expect(result.status).toBe('blocked');
    expect(result.message).toContain('does not point to the canonical skill path');
    expect(readFileSync(join(targetRoot(), 'alpha', 'SKILL.md'), 'utf-8')).toBe('other');
  });

  it('resolves target from targetProfile when targetSkillRoot is not provided', () => {
    createSkill('alpha');
    const profileRoot = join(tmpDir, 'profile-skills');
    const result = mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetProfiles: [
        {
          id: 'codex',
          label: 'Codex',
          skillDirs: [profileRoot],
          linkMode: 'junction',
          supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
        },
      ],
    });

    expect(result.status).toBe('mapped');
    expect(result.linkPath).toBe(join(profileRoot, 'alpha'));
  });

  it('enforces no-copy by creating a link, not a copy', () => {
    createSkill('alpha');
    const result = mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
      linkMode: 'junction',
    });

    expect(result.status).toBe('mapped');
    const mappings = readSkillMappings(mappingsPath());
    expect(mappings.mappings.alpha.links.codex?.mode).toBe('junction');
    // Verify it's actually a link, not a copy
    const detection = detectLinkType(join(targetRoot(), 'alpha'));
    expect(detection.type).not.toBe('directory');
  });

  it('stores symlink mode in mapping when linkMode is symlink', () => {
    createSkill('alpha');
    // Use junction to actually create the link (symlink requires elevation on Windows)
    const result = mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
      linkMode: 'junction',
    });

    expect(result.status).toBe('mapped');
    const mappings = readSkillMappings(mappingsPath());
    expect(mappings.mappings.alpha.links.codex?.mode).toBe('junction');
  });
});

describe('unmapSkill', () => {
  it('removes a junction pointing to canonical skill and cleans mappings', () => {
    createSkill('alpha');
    mkdirSync(targetRoot(), { recursive: true });
    symlinkSync(join(tmpDir, 'skills', 'alpha'), join(targetRoot(), 'alpha'), 'junction');

    // Pre-populate mapping
    mapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });

    const result = unmapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });

    expect(result.status).toBe('unmapped');
    expect(existsSync(join(targetRoot(), 'alpha'))).toBe(false);
    const mappings = readSkillMappings(mappingsPath());
    expect(mappings.mappings.alpha?.links.codex).toBeUndefined();
  });

  it('removes a link pointing to canonical skill', () => {
    createSkill('alpha');
    mkdirSync(targetRoot(), { recursive: true });
    symlinkSync(join(tmpDir, 'skills', 'alpha'), join(targetRoot(), 'alpha'), 'junction');

    const result = unmapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });

    expect(result.status).toBe('unmapped');
    expect(existsSync(join(targetRoot(), 'alpha'))).toBe(false);
  });

  it('refuses to delete a plain directory', () => {
    createSkill('alpha');
    const dir = join(targetRoot(), 'alpha');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'content.txt'), 'data', 'utf-8');

    const result = unmapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });

    expect(result.status).toBe('refused');
    expect(result.message).toContain('plain directory');
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, 'content.txt'))).toBe(true);
  });

  it('refuses to delete a link pointing outside canonical skill', () => {
    const otherDir = join(tmpDir, 'other', 'alpha');
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, 'SKILL.md'), 'other', 'utf-8');
    mkdirSync(targetRoot(), { recursive: true });
    symlinkSync(otherDir, join(targetRoot(), 'alpha'), 'junction');

    const result = unmapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });

    expect(result.status).toBe('refused');
    expect(result.message).toContain('Manual cleanup');
    expect(existsSync(join(targetRoot(), 'alpha'))).toBe(true);
  });

  it('returns not-found when no path exists at target', () => {
    const result = unmapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });

    expect(result.status).toBe('not-found');
  });

  it('cleans up stale mapping when path is missing', () => {
    // Write a stale mapping
    const mp = mappingsPath();
    mkdirSync(join(tmpDir, 'registry'), { recursive: true });
    writeFileSync(
      mp,
      JSON.stringify({
        mappings: {
          alpha: {
            skillName: 'alpha',
            canonicalPath: join(tmpDir, 'skills', 'alpha'),
            links: {
              codex: {
                path: join(targetRoot(), 'alpha'),
                mode: 'junction',
                status: 'linked',
                updatedAt: '2025-01-01',
              },
            },
            updatedAt: '2025-01-01',
          },
        },
      }),
      'utf-8',
    );

    const result = unmapSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mp,
      targetSkillRoot: targetRoot(),
    });

    expect(result.status).toBe('not-found');
    const mappings = readSkillMappings(mp);
    expect(mappings.mappings.alpha).toBeUndefined();
  });

  it('returns not-found when target is unknown', () => {
    const result = unmapSkill('alpha', 'unknown', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
    });
    expect(result.status).toBe('not-found');
  });
});

describe('adoptSkill', () => {
  it(
    'backs up plain directory, replaces with junction, records in mappings',
    () => {
      createSkill('alpha');
      const dir = join(targetRoot(), 'alpha');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'local.txt'), 'local data', 'utf-8');

      const result = adoptSkill('alpha', 'codex', {
        projectRoot: tmpDir,
        mappingsPath: mappingsPath(),
        targetSkillRoot: targetRoot(),
        backupsRoot: join(tmpDir, 'backups'),
      });

      expect(result.status).toBe('adopted');
      expect(result.backupPath).toBeTruthy();
      expect(existsSync(join(result.backupPath, 'local.txt'))).toBe(true);
      expect(readFileSync(join(result.backupPath, 'local.txt'), 'utf-8')).toBe('local data');
      expect(existsSync(join(targetRoot(), 'alpha', 'SKILL.md'))).toBe(true);
      expect(detectLinkType(join(targetRoot(), 'alpha')).type).toBe('junction');

      const mappings = readSkillMappings(mappingsPath());
      expect(mappings.mappings.alpha).toBeDefined();
      expect(mappings.mappings.alpha.links.codex?.backupPath).toBe(result.backupPath);
    },
    WINDOWS_LINK_TEST_TIMEOUT,
  );

  it('returns not-found when skill has no SKILL.md', () => {
    mkdirSync(join(tmpDir, 'skills', 'empty'), { recursive: true });
    const result = adoptSkill('empty', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });
    expect(result.status).toBe('not-found');
  });

  it('returns blocked when target path is missing', () => {
    createSkill('alpha');
    const result = adoptSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });
    expect(result.status).toBe('blocked');
    expect(result.message).toContain('No existing directory');
  });

  it('returns already-linked when target is a junction pointing to canonical', () => {
    createSkill('alpha');
    mkdirSync(targetRoot(), { recursive: true });
    symlinkSync(join(tmpDir, 'skills', 'alpha'), join(targetRoot(), 'alpha'), 'junction');

    const result = adoptSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });
    expect(result.status).toBe('already-linked');
    expect(result.message).toContain('already linked');
  });

  it('returns blocked when target is a junction pointing elsewhere', () => {
    createSkill('alpha');
    const otherDir = join(tmpDir, 'other', 'alpha');
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, 'SKILL.md'), 'other', 'utf-8');
    mkdirSync(targetRoot(), { recursive: true });
    symlinkSync(otherDir, join(targetRoot(), 'alpha'), 'junction');

    const result = adoptSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
    });
    expect(result.status).toBe('blocked');
    expect(result.message).toContain('already a link');
  });

  it('backup path follows timestamp convention', () => {
    createSkill('alpha');
    const dir = join(targetRoot(), 'alpha');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'file.txt'), 'data', 'utf-8');

    const result = adoptSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetSkillRoot: targetRoot(),
      backupsRoot: join(tmpDir, 'backups'),
    });

    expect(result.backupPath).toContain(join(tmpDir, 'backups'));
    expect(result.backupPath).toContain('codex');
    expect(result.backupPath).toContain('alpha');
  });

  it('resolves target from targetProfile when targetSkillRoot is not provided', () => {
    createSkill('alpha');
    const profileRoot = join(tmpDir, 'profile-skills');
    const dir = join(profileRoot, 'alpha');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'file.txt'), 'data', 'utf-8');

    const result = adoptSkill('alpha', 'codex', {
      projectRoot: tmpDir,
      mappingsPath: mappingsPath(),
      targetProfiles: [
        {
          id: 'codex',
          label: 'Codex',
          skillDirs: [profileRoot],
          linkMode: 'junction',
          supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
        },
      ],
      backupsRoot: join(tmpDir, 'backups'),
    });

    expect(result.status).toBe('adopted');
    expect(result.linkPath).toBe(join(profileRoot, 'alpha'));
  });
});
