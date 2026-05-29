// Tests for project diagnostics — checks structure, registry integrity, and install links.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../doctor.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-doctor-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createMinimalProject(): void {
  const dirs = ['incoming', 'skills', 'overlays', 'registry', 'tasks'];
  for (const d of dirs) {
    mkdirSync(join(tmpDir, d), { recursive: true });
  }
}

describe('runDoctor', () => {
  it('reports healthy for a complete project', () => {
    createMinimalProject();
    const report = runDoctor(tmpDir);
    expect(report.healthy).toBe(true);
  });

  it('warns about missing directories', () => {
    // Only create some dirs
    mkdirSync(join(tmpDir, 'skills'), { recursive: true });
    const report = runDoctor(tmpDir);
    expect(report.healthy).toBe(false);
    expect(report.issues.some((i) => i.message.includes('incoming'))).toBe(true);
    expect(report.issues.some((i) => i.message.includes('registry'))).toBe(true);
    expect(report.issues.some((i) => i.message.includes('overlays'))).toBe(true);
  });

  it('reports info about missing registry files', () => {
    createMinimalProject();
    const report = runDoctor(tmpDir);
    const missingRegFiles = report.issues.filter((i) => i.category === 'registry');
    expect(missingRegFiles.length).toBeGreaterThan(0);
  });

  it('reports stale install links', () => {
    createMinimalProject();
    // Create installs.json with a stale link
    writeFileSync(
      join(tmpDir, 'registry', 'installs.json'),
      JSON.stringify({
        installs: {
          'stale-skill@claude': {
            skillName: 'stale-skill',
            target: 'claude',
            installedAt: new Date().toISOString(),
            type: 'standard',
            linkPath: join(tmpDir, 'nonexistent-link'),
          },
        },
      }),
      'utf-8',
    );
    const report = runDoctor(tmpDir);
    expect(report.issues.some((i) => i.message.includes('stale'))).toBe(true);
  });

  it('reports corrupted registry files as errors', () => {
    createMinimalProject();
    writeFileSync(join(tmpDir, 'registry', 'skills.json'), '{invalid json!!!', 'utf-8');
    const report = runDoctor(tmpDir);
    expect(report.healthy).toBe(false);
    const corruptionIssue = report.issues.find(
      (i) => i.category === 'registry' && i.message.includes('corrupted'),
    );
    expect(corruptionIssue).toBeDefined();
    expect(corruptionIssue?.severity).toBe('error');
  });
});
