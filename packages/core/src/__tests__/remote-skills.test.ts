// Tests for remote skill intake guards; validates query, remote IDs, payload limits, and safe file paths.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeRemoteQuery,
  safeDownloadedFilePath,
  validateDownloadedSkillPayload,
  validateRemoteSkillId,
} from '../remote-skills.js';

function validPayload(overrides: Record<string, string> = {}) {
  return {
    files: [
      {
        path: 'SKILL.md',
        contents: [
          '---',
          'name: remote-test',
          'description: a remote test skill',
          '---',
          '',
          '# Remote test',
        ].join('\n'),
      },
      ...Object.entries(overrides).map(([path, contents]) => ({ path, contents })),
    ],
    hash: 'abc123',
  };
}

describe('remote skill guards', () => {
  it('normalizes query text and clamps result limits', () => {
    expect(normalizeRemoteQuery('  typescript  ', 100)).toEqual({
      query: 'typescript',
      limit: 50,
    });
    expect(normalizeRemoteQuery('react', 0)).toEqual({ query: 'react', limit: 1 });
  });

  it('rejects empty and oversized remote queries', () => {
    expect(() => normalizeRemoteQuery('   ')).toThrow(/query/i);
    expect(() => normalizeRemoteQuery('x'.repeat(101))).toThrow(/100/);
  });

  it('accepts source-like remote skill IDs made from safe segments', () => {
    expect(validateRemoteSkillId('github/awesome-copilot/javascript-typescript-jest')).toBe(
      'github/awesome-copilot/javascript-typescript-jest',
    );
    expect(validateRemoteSkillId('owner.repo/repo_name/skill-1')).toBe(
      'owner.repo/repo_name/skill-1',
    );
  });

  it('rejects traversal, absolute, and malformed remote skill IDs', () => {
    const invalidIds = [
      '',
      '../escape',
      'github//skill',
      '/github/repo/skill',
      'C:/github/repo/skill',
      'github\\repo\\skill',
      'github/repo/../skill',
      'github/repo/skill?',
    ];

    for (const id of invalidIds) {
      expect(() => validateRemoteSkillId(id)).toThrow(/remote skill id/i);
    }
  });

  it('validates a safe downloaded payload and reports its size', () => {
    const result = validateDownloadedSkillPayload(validPayload({ 'docs/guide.md': 'hello' }));

    expect(result.status).toBe('pass');
    expect(result.issues).toEqual([]);
    expect(result.fileCount).toBe(2);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.skillMd).toContain('name: remote-test');
  });

  it('rejects payloads without a root SKILL.md', () => {
    const result = validateDownloadedSkillPayload({
      files: [{ path: 'nested/SKILL.md', contents: '# nope' }],
      hash: 'abc123',
    });

    expect(result.status).toBe('fail');
    expect(result.issues.join('\n')).toMatch(/root SKILL\.md/i);
  });

  it('rejects payloads with unsafe paths and oversized contents', () => {
    const result = validateDownloadedSkillPayload({
      files: [
        { path: 'SKILL.md', contents: 'x'.repeat(512 * 1024 + 1) },
        { path: '../escape.txt', contents: 'escape' },
        { path: 'docs/bad:name.md', contents: 'bad name' },
      ],
      hash: 'abc123',
    });

    expect(result.status).toBe('fail');
    expect(result.issues.join('\n')).toMatch(/too large/i);
    expect(result.issues.join('\n')).toMatch(/unsafe/i);
  });

  it('resolves downloaded file paths inside the staging directory only', () => {
    const stagingDir = join('C:', 'SkillGov', 'incoming', '.remote-downloads', 'remote-test');
    const resolved = safeDownloadedFilePath(stagingDir, 'docs/guide.md');

    expect(resolved).toBe(join(stagingDir, 'docs', 'guide.md'));
    expect(() => safeDownloadedFilePath(stagingDir, '../outside.md')).toThrow(/unsafe/i);
    expect(() => safeDownloadedFilePath(stagingDir, 'C:/outside.md')).toThrow(/unsafe/i);
    expect(() => safeDownloadedFilePath(stagingDir, 'docs\\outside.md')).toThrow(/unsafe/i);
    expect(() => safeDownloadedFilePath(stagingDir, 'docs/bad:name.md')).toThrow(/unsafe/i);
  });
});
