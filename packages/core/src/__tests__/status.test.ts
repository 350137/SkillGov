// Tests for project status reporter — skill discovery, overlay detection, and install listing.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
    const status = getProjectStatus(tmpDir);
    expect(status.skills.length).toBe(2);
    expect(status.skills.some((s) => s.name === 'alpha-skill')).toBe(true);
    expect(status.skills.some((s) => s.name === 'beta-skill')).toBe(true);
  });

  it('reports overlay targets for skills', () => {
    const status = getProjectStatus(tmpDir);
    const beta = status.skills.find((s) => s.name === 'beta-skill');
    expect(beta).toBeDefined();
    expect(beta?.hasOverlay).toBe(true);
    expect(beta?.overlayTargets).toContain('codex');
  });

  it('reports registry entry count', () => {
    const status = getProjectStatus(tmpDir);
    expect(status.registryEntries).toBe(1);
  });

  it('aggregates installedTargets from installs registry', () => {
    writeFileSync(
      join(tmpDir, 'registry', 'installs.json'),
      JSON.stringify({
        installs: {
          'alpha-skill:claude': {
            skillName: 'alpha-skill',
            target: 'claude',
            installedAt: '2025-01-01',
            type: 'standard',
            linkPath: '/tmp/claude/alpha',
          },
          'alpha-skill:codex': {
            skillName: 'alpha-skill',
            target: 'codex',
            installedAt: '2025-01-02',
            type: 'standard',
            linkPath: '/tmp/codex/alpha',
          },
        },
      }),
      'utf-8',
    );
    const status = getProjectStatus(tmpDir);
    const alpha = status.skills.find((s) => s.name === 'alpha-skill');
    expect(alpha?.installedTargets).toContain('claude');
    expect(alpha?.installedTargets).toContain('codex');
    const beta = status.skills.find((s) => s.name === 'beta-skill');
    expect(beta?.installedTargets).toEqual([]);
  });
});
