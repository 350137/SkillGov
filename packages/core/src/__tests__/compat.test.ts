import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CompatibilityResult, checkCompatibility } from '../compat.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-compat-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSkill(
  name: string,
  fmOverrides: Record<string, string> = {},
  markdownExtra = '',
): string {
  const dir = join(tmpDir, name);
  mkdirSync(dir, { recursive: true });
  const fm: Record<string, string> = { name, description: 'a test skill', ...fmOverrides };
  const lines = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\n${lines}\n---\n\n# ${name}\n\nTest content.\n${markdownExtra}`,
    'utf-8',
  );
  return dir;
}

describe('checkCompatibility', () => {
  it('returns compatible for generic skill on Claude', () => {
    const dir = createSkill('generic-skill');
    const result = checkCompatibility(dir, 'claude');
    expect(result.status).toBe('compatible');
    expect(result.targetName).toBe('claude');
  });

  it('returns compatible for generic skill on Codex', () => {
    const dir = createSkill('generic-skill');
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('compatible');
    expect(result.targetName).toBe('codex');
  });

  it('returns unknown for invalid target', () => {
    const dir = createSkill('any-skill');
    const result = checkCompatibility(dir, 'unknown-target');
    expect(result.status).toBe('unknown');
  });

  it('returns needs-overlay for claude-only skill on Codex', () => {
    const dir = createSkill('claude-only', { compatibility: 'claude-only' });
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'target')).toBe(true);
  });

  it('returns compatible for claude-only skill on Claude', () => {
    const dir = createSkill('claude-only', { compatibility: 'claude-only' });
    const result = checkCompatibility(dir, 'claude');
    expect(result.status).toBe('compatible');
  });

  it('returns needs-overlay for codex-only skill on Claude', () => {
    const dir = createSkill('codex-only', { compatibility: 'codex-only' });
    const result = checkCompatibility(dir, 'claude');
    expect(result.status).toBe('needs-overlay');
  });

  it('returns unsupported for self-declared unsupported skill', () => {
    const dir = createSkill('blocked-skill', { compatibility: 'unsupported' });
    const result = checkCompatibility(dir, 'claude');
    expect(result.status).toBe('unsupported');
  });

  it('detects Claude-specific tool references for Codex target', () => {
    const dir = createSkill('uses-computer', {}, 'Use the `computer` tool to take screenshots.');
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'tool')).toBe(true);
  });

  it('passes Claude-specific tool references for Claude target', () => {
    const dir = createSkill('uses-computer', {}, 'Use the `computer` tool.');
    const result = checkCompatibility(dir, 'claude');
    expect(result.status).toBe('compatible');
  });

  it('warns about MCP dependencies', () => {
    const dir = createSkill('mcp-skill', { 'mcp-servers': '["filesystem", "github"]' });
    const result = checkCompatibility(dir, 'claude');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'dependency')).toBe(true);
  });

  it('warns about Python scripts', () => {
    const dir = createSkill('py-skill', { scripts: '["analyze.py"]' });
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'script')).toBe(true);
  });

  it('warns about CLI dependencies', () => {
    const dir = createSkill('cli-skill', { 'cli-dependencies': '["docker", "kubectl"]' });
    const result = checkCompatibility(dir, 'claude');
    expect(result.status).toBe('needs-overlay');
  });

  it('detects Claude references in markdown for Codex target', () => {
    const dir = createSkill('ref-claude', {}, 'This skill uses Claude-specific features.');
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'target')).toBe(true);
  });

  it('handles comma-separated allowed-tools', () => {
    const dir = createSkill('tool-list', { 'allowed-tools': 'computer, bash' });
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.message.includes('computer'))).toBe(true);
  });
});
