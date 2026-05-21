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
});
