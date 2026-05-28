// Tests for target compatibility checker — validates skill compatibility with Claude and Codex.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CompatibilityResult, checkCompatibility } from '../compat.js';
import { listTargetProfiles } from '../targets.js';

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

  it('returns compatible with info for unknown target', () => {
    const dir = createSkill('any-skill');
    const result = checkCompatibility(dir, 'unknown-target');
    expect(result.status).toBe('compatible');
    expect(result.issues.some((i) => i.severity === 'info' && i.category === 'target')).toBe(true);
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

  it('does not require overlay for incidental Claude mentions on Codex', () => {
    const dir = createSkill(
      'incidental-claude',
      {},
      'Example comment: // In Claude Code / AI environment.',
    );
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('compatible');
    expect(result.issues.some((i) => i.severity === 'warning' && i.category === 'target')).toBe(
      false,
    );
  });

  it('returns needs-overlay for explicit Claude runtime requirements on Codex', () => {
    const dir = createSkill('requires-claude', {}, 'This skill requires Claude Code to run.');
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'target')).toBe(true);
  });

  it('returns needs-overlay for Claude-specific skill paths on Codex', () => {
    const dir = createSkill('claude-path', {}, 'Install this under ~/.claude/skills/claude-path.');
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'target')).toBe(true);
  });

  it('allows agent frontmatter when the target supports agent routing', () => {
    const dir = createSkill('agent-aware', { agent: 'Explore' });
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('compatible');
  });

  it('allows agent frontmatter for configured OpenCode-like targets with agent support', () => {
    const dir = createSkill('opencode-agent-aware', { agent: 'Build' });
    const targetProfiles = listTargetProfiles([
      { id: 'opencode', label: 'OpenCode', skillDirs: ['D:/OpenCode/skills'] },
    ]);
    const result = checkCompatibility(dir, 'opencode', { targetProfiles });
    expect(result.status).toBe('compatible');
  });

  it('returns needs-overlay when agent routing is declared for a target without agent support', () => {
    const dir = createSkill('agent-required', { agent: 'Explore' });
    const targetProfiles = listTargetProfiles([
      {
        id: 'plain',
        label: 'Plain Tool',
        skillDirs: ['D:/Plain/skills'],
        supports: { agents: 'none' },
      },
    ]);
    const result = checkCompatibility(dir, 'plain', { targetProfiles });
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'capability')).toBe(true);
  });

  it('returns needs-overlay when Claude hooks are declared for Codex', () => {
    const dir = createSkill('hooked', { hooks: 'PostToolUse' });
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.category === 'capability')).toBe(true);
  });

  it('returns needs-mapping when content is compatible but the target has no linked mapping', () => {
    const dir = createSkill('unmapped-compatible');
    const result = checkCompatibility(dir, 'codex', {
      mappingsPath: join(tmpDir, 'mappings.json'),
    });
    expect(result.status).toBe('needs-mapping');
    expect(result.issues.some((i) => i.category === 'mapping')).toBe(true);
  });

  it('handles comma-separated allowed-tools', () => {
    const dir = createSkill('tool-list', { 'allowed-tools': 'computer, bash' });
    const result = checkCompatibility(dir, 'codex');
    expect(result.status).toBe('needs-overlay');
    expect(result.issues.some((i) => i.message.includes('computer'))).toBe(true);
  });
});
