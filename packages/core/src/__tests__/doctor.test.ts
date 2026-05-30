// Tests for project diagnostics — checks structure, registry integrity, and mapping links.
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
  writeFileSync(join(tmpDir, 'registry', 'mappings.json'), '{"mappings":{}}', 'utf-8');
}

describe('runDoctor', () => {
  it('reports healthy for a complete project', () => {
    createMinimalProject();
    const report = runDoctor(tmpDir);
    expect(report.healthy).toBe(true);
  });

  it('warns about missing directories', () => {
    mkdirSync(join(tmpDir, 'skills'), { recursive: true });
    const report = runDoctor(tmpDir);
    expect(report.healthy).toBe(false);
    expect(report.issues.some((i) => i.message.includes('incoming'))).toBe(true);
    expect(report.issues.some((i) => i.message.includes('registry'))).toBe(true);
    expect(report.issues.some((i) => i.message.includes('overlays'))).toBe(true);
  });

  it('reports info about missing registry files', () => {
    createMinimalProject();
    // Remove mappings.json to trigger missing file info
    rmSync(join(tmpDir, 'registry', 'mappings.json'));
    const report = runDoctor(tmpDir);
    const missingRegFiles = report.issues.filter(
      (i) => i.category === 'registry' && i.message.includes('not found'),
    );
    expect(missingRegFiles.length).toBeGreaterThan(0);
  });

  it('reports stale mapping links', () => {
    createMinimalProject();
    writeFileSync(
      join(tmpDir, 'registry', 'mappings.json'),
      JSON.stringify({
        mappings: {
          'stale-skill': {
            skillName: 'stale-skill',
            canonicalPath: join(tmpDir, 'skills', 'stale-skill'),
            links: {
              claude: {
                path: join(tmpDir, 'nonexistent-link'),
                mode: 'junction',
                status: 'linked',
                type: 'standard',
                updatedAt: new Date().toISOString(),
              },
            },
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8',
    );
    const report = runDoctor(tmpDir);
    expect(report.issues.some((i) => i.message.includes('Stale mapping'))).toBe(true);
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

  it('reports legacy installs.json as info when present', () => {
    createMinimalProject();
    writeFileSync(join(tmpDir, 'registry', 'installs.json'), '{"installs":{}}', 'utf-8');
    const report = runDoctor(tmpDir);
    const legacyIssue = report.issues.find(
      (i) => i.category === 'registry' && i.message.includes('installs.json'),
    );
    expect(legacyIssue).toBeDefined();
    expect(legacyIssue?.severity).toBe('info');
  });

  it('does not throw when mappings.json is corrupted', () => {
    createMinimalProject();
    writeFileSync(join(tmpDir, 'registry', 'mappings.json'), '{broken!!!', 'utf-8');
    const report = runDoctor(tmpDir);
    expect(report.healthy).toBe(false);
    const corruptionIssue = report.issues.find(
      (i) => i.category === 'registry' && i.message.includes('corrupted'),
    );
    expect(corruptionIssue).toBeDefined();
  });
});
