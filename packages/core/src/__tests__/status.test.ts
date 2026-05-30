// Tests for project status reporter — skill discovery, overlay detection, and install listing.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getProjectStatus } from '../status.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-status-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(join(tmpDir, 'skills', 'alpha-skill'), { recursive: true });
  writeFileSync(
    join(tmpDir, 'skills', 'alpha-skill', 'SKILL.md'),
    '---\nname: alpha\ndescription: alpha\n---\n\nAlpha.\n',
    'utf-8',
  );
  mkdirSync(join(tmpDir, 'skills', 'beta-skill'), { recursive: true });
  writeFileSync(
    join(tmpDir, 'skills', 'beta-skill', 'SKILL.md'),
    '---\nname: beta\ndescription: beta\n---\n\nBeta.\n',
    'utf-8',
  );
  mkdirSync(join(tmpDir, 'overlays', 'codex', 'beta-skill'), { recursive: true });
  mkdirSync(join(tmpDir, 'registry'), { recursive: true });
  // Create a skills registry entry
  writeFileSync(
    join(tmpDir, 'registry', 'skills.json'),
    JSON.stringify({
      skills: {
        'alpha-skill': {
          name: 'alpha-skill',
          sourcePath: '/tmp',
          origin: 'local',
          fileHash: 'abc',
          importedAt: '2025-01-01',
          validationStatus: 'pass',
        },
      },
    }),
    'utf-8',
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('getProjectStatus', () => {
  it('lists skills discovered in filesystem', () => {
    const status = getProjectStatus(tmpDir, { home: join(tmpDir, 'home') });
    expect(status.skills.length).toBe(2);
    expect(status.skills.some((s) => s.name === 'alpha-skill')).toBe(true);
    expect(status.skills.some((s) => s.name === 'beta-skill')).toBe(true);
  });

  it('reports overlay targets for skills', () => {
    const status = getProjectStatus(tmpDir, { home: join(tmpDir, 'home') });
    const beta = status.skills.find((s) => s.name === 'beta-skill');
    expect(beta).toBeDefined();
    expect(beta?.hasOverlay).toBe(true);
    expect(beta?.overlayTargets).toContain('codex');
  });

  it('reports registry entry count', () => {
    const status = getProjectStatus(tmpDir, { home: join(tmpDir, 'home') });
    expect(status.registryEntries).toBe(1);
  });

  it('aggregates installedTargets from agentStates when junctions exist', () => {
    const canonicalPath = join(tmpDir, 'skills', 'alpha-skill');
    const codexDir = join(tmpDir, 'home', '.codex', 'skills');
    const claudeDir = join(tmpDir, 'home', '.claude', 'skills');
    mkdirSync(codexDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });
    symlinkSync(canonicalPath, join(codexDir, 'alpha-skill'), 'junction');
    symlinkSync(canonicalPath, join(claudeDir, 'alpha-skill'), 'junction');

    const status = getProjectStatus(tmpDir, { home: join(tmpDir, 'home') });
    const alpha = status.skills.find((s) => s.name === 'alpha-skill');
    expect(alpha?.installedTargets).toContain('claude');
    expect(alpha?.installedTargets).toContain('codex');
    const beta = status.skills.find((s) => s.name === 'beta-skill');
    expect(beta?.installedTargets).toEqual([]);
  });

  it('uses the same managed inventory across project and agent skill directories', () => {
    mkdirSync(join(tmpDir, 'skills', 'cached-skill'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'skills', 'cached-skill', 'SKILL.md'),
      '---\nname: cached\ndescription: cached\n---\n\nCached.\n',
      'utf-8',
    );
    mkdirSync(join(tmpDir, '.codex', 'skills', 'codex-only'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.codex', 'skills', 'codex-only', 'SKILL.md'),
      '---\nname: codex-only\ndescription: codex only\n---\n\nCodex only.\n',
      'utf-8',
    );
    writeFileSync(
      join(tmpDir, 'registry', 'skills.json'),
      JSON.stringify({
        skills: {
          'alpha-skill': {
            name: 'alpha-skill',
            sourcePath: '/tmp',
            origin: 'local',
            fileHash: 'abc',
            importedAt: '2025-01-01',
            validationStatus: 'pass',
          },
          'cached-skill': {
            name: 'cached-skill',
            sourcePath: '/tmp/cache',
            origin: 'codex-plugin-cache',
            fileHash: 'def',
            importedAt: '2025-01-01',
            validationStatus: 'pass',
          },
        },
      }),
      'utf-8',
    );

    const status = getProjectStatus(tmpDir, { home: tmpDir });
    const names = status.skills.map((s) => s.name).sort();

    expect(names).toEqual(['alpha-skill', 'beta-skill', 'cached-skill', 'codex-only']);
    expect(status.registryEntries).toBe(2);
    // codex-only is a plain directory (unmanaged-local), not a managed link
    expect(status.skills.find((s) => s.name === 'codex-only')?.installedTargets).toEqual([]);
  });

  it('installedTargets only counts managed-linked, not unmanaged-local', () => {
    mkdirSync(join(tmpDir, '.codex', 'skills', 'shared-skill'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.codex', 'skills', 'shared-skill', 'SKILL.md'),
      '---\nname: shared-skill\ndescription: shared\n---\n\nShared.\n',
      'utf-8',
    );
    mkdirSync(join(tmpDir, '.claude', 'skills', 'shared-skill'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'skills', 'shared-skill', 'SKILL.md'),
      '---\nname: shared-skill\ndescription: shared\n---\n\nShared.\n',
      'utf-8',
    );

    const status = getProjectStatus(tmpDir, { home: tmpDir });
    const shared = status.skills.find((s) => s.name === 'shared-skill');
    expect(shared).toBeDefined();
    // Both are plain directories (unmanaged-local), not managed links
    expect(shared?.installedTargets).toEqual([]);
  });

  it('reports non-skill directories without counting them as skills', () => {
    mkdirSync(join(tmpDir, 'skills', 'not-a-skill'), { recursive: true });
    writeFileSync(join(tmpDir, 'skills', 'not-a-skill', 'README.md'), 'notes', 'utf-8');

    const status = getProjectStatus(tmpDir, { home: join(tmpDir, 'home') });

    expect(status.skills.map((s) => s.name).sort()).toEqual(['alpha-skill', 'beta-skill']);
    expect(status.nonSkillDirectories).toEqual([
      {
        name: 'not-a-skill',
        path: join(tmpDir, 'skills', 'not-a-skill'),
        issue: 'Missing SKILL.md',
      },
    ]);
  });
});
