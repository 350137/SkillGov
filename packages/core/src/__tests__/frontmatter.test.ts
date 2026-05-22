// Tests for SKILL.md frontmatter parser — handles valid, missing, and malformed frontmatter.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for frontmatter parsing — extracts and validates YAML frontmatter from SKILL.md files.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../frontmatter.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-fm-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeMd(content: string): string {
  const p = join(tmpDir, 'SKILL.md');
  writeFileSync(p, content, 'utf-8');
  return p;
}

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with name and description', () => {
    const md = writeMd(`---
name: my-skill
description: a test skill
---
# My Skill
`);
    const result = parseFrontmatter(md);
    expect(result.data).toEqual({ name: 'my-skill', description: 'a test skill' });
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty data and no errors when SKILL.md has no frontmatter', () => {
    const md = writeMd('# Just a heading\n\nNo frontmatter here.');
    const result = parseFrontmatter(md);
    expect(result.data).toEqual({});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/no frontmatter/i);
  });

  it('returns error when the opening delimiter is missing', () => {
    const md = writeMd('name: my-skill\n---\ncontent');
    const result = parseFrontmatter(md);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error for unparseable frontmatter lines', () => {
    const md = writeMd(`---
: missing key
onlyvalue
---
`);
    const result = parseFrontmatter(md);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.data).toEqual({});
  });

  it('handles quoted values', () => {
    const md = writeMd(`---
name: "my skill with spaces"
description: 'single quoted value'
---
`);
    const result = parseFrontmatter(md);
    expect(result.data.name).toBe('my skill with spaces');
    expect(result.data.description).toBe('single quoted value');
  });
});
