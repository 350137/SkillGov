// Tests for append-only JSONL operation log — write, read, and malformed line handling.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for append-only JSONL operation log — write, read, and empty-file handling.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendOperation, readOperations } from '../operations.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-test-ops-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('appendOperation', () => {
  it('appends an operation to the log and returns a full operation object', () => {
    const logPath = join(tmpDir, 'operations.jsonl');
    const op = appendOperation(logPath, {
      action: 'install',
      skill: 'test-skill',
      target: 'claude',
      status: 'started',
    });

    expect(op.id).toBeDefined();
    expect(op.id.length).toBeGreaterThan(0);
    expect(op.timestamp).toBeDefined();
    expect(op.action).toBe('install');
    expect(op.skill).toBe('test-skill');
    expect(op.target).toBe('claude');
    expect(op.status).toBe('started');
    expect(existsSync(logPath)).toBe(true);
  });

  it('appends multiple operations sequentially', () => {
    const logPath = join(tmpDir, 'operations.jsonl');
    appendOperation(logPath, { action: 'install', skill: 'a', status: 'started' });
    appendOperation(logPath, { action: 'install', skill: 'a', status: 'completed' });
    appendOperation(logPath, { action: 'uninstall', skill: 'a', status: 'started' });

    const ops = readOperations(logPath);
    expect(ops).toHaveLength(3);
  });
});

describe('readOperations', () => {
  it('returns empty array when log file does not exist', () => {
    const ops = readOperations(join(tmpDir, 'nonexistent.jsonl'));
    expect(ops).toEqual([]);
  });

  it('returns empty array for empty log file', () => {
    const logPath = join(tmpDir, 'operations.jsonl');
    writeFileSync(logPath, '', 'utf-8');
    const ops = readOperations(logPath);
    expect(ops).toEqual([]);
  });

  it('returns all operations in order', () => {
    const logPath = join(tmpDir, 'operations.jsonl');
    appendOperation(logPath, { action: 'install', skill: 'x', status: 'started' });
    appendOperation(logPath, { action: 'install', skill: 'x', status: 'completed' });

    const ops = readOperations(logPath);
    expect(ops).toHaveLength(2);
    expect(ops[0].action).toBe('install');
    expect(ops[0].skill).toBe('x');
  });

  it('skips malformed lines gracefully', () => {
    const logPath = join(tmpDir, 'operations.jsonl');
    writeFileSync(logPath, '{"valid": true}\nnot-json\n{"also-valid": 1}\n', 'utf-8');
    const ops = readOperations(logPath);
    expect(ops).toHaveLength(2);
  });
});
