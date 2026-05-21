import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for file hashing — computes SHA-256 hash of files and directories for drift detection.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashDirectory, hashFile } from '../hash.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-hash-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('hashFile', () => {
  it('produces a consistent hash for the same content', () => {
    const p = join(tmpDir, 'a.txt');
    writeFileSync(p, 'hello', 'utf-8');
    const h1 = hashFile(p);
    const h2 = hashFile(p);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different content', () => {
    const a = join(tmpDir, 'a.txt');
    const b = join(tmpDir, 'b.txt');
    writeFileSync(a, 'hello', 'utf-8');
    writeFileSync(b, 'world', 'utf-8');
    expect(hashFile(a)).not.toBe(hashFile(b));
  });

  it('throws a clear error for non-existent file', () => {
    expect(() => hashFile(join(tmpDir, 'nope.txt'))).toThrow();
  });
});

describe('hashDirectory', () => {
  it('produces a hash based on all files in the directory', () => {
    writeFileSync(join(tmpDir, 'f1.txt'), 'content1', 'utf-8');
    writeFileSync(join(tmpDir, 'f2.txt'), 'content2', 'utf-8');
    const h = hashDirectory(tmpDir);
    expect(h).toBeTruthy();
    expect(typeof h).toBe('string');
  });

  it('returns same hash for identical directory contents', () => {
    writeFileSync(join(tmpDir, 'a.txt'), 'data', 'utf-8');
    const h1 = hashDirectory(tmpDir);

    const tmpDir2 = join(tmpdir(), `skillgov-hash2-${randomUUID()}`);
    mkdirSync(tmpDir2, { recursive: true });
    writeFileSync(join(tmpDir2, 'a.txt'), 'data', 'utf-8');
    const h2 = hashDirectory(tmpDir2);
    expect(h1).toBe(h2);
    rmSync(tmpDir2, { recursive: true, force: true });
  });
});
