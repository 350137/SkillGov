// Tests for JSON registry read/write — skills, installs, and duplicate detection.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for registry state file read/write operations — skills, compatibility, and installs.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type CompatibilityRegistry,
  type InstallsRegistry,
  RegistryCorruptedError,
  type SkillsRegistry,
  addSkillEntry,
  readRegistry,
  writeRegistry,
} from '../registry.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-test-registry-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('readRegistry / writeRegistry', () => {
  it('returns default skills registry when file does not exist', () => {
    const data = readRegistry<SkillsRegistry>(join(tmpDir, 'skills.json'), { skills: {} });
    expect(data.skills).toEqual({});
  });

  it('returns default compatibility registry when file does not exist', () => {
    const data = readRegistry<CompatibilityRegistry>(join(tmpDir, 'compatibility.json'), {
      entries: [],
    });
    expect(data.entries).toEqual([]);
  });

  it('returns default installs registry when file does not exist', () => {
    const data = readRegistry<InstallsRegistry>(join(tmpDir, 'installs.json'), { installs: {} });
    expect(data.installs).toEqual({});
  });

  it('writes and reads back skills data', () => {
    const path = join(tmpDir, 'skills.json');
    const data: SkillsRegistry = {
      skills: {
        'test-skill': {
          name: 'test-skill',
          sourcePath: '/tmp/test',
          origin: 'local',
          fileHash: 'abc123',
          importedAt: new Date().toISOString(),
          validationStatus: 'pending',
        },
      },
    };
    writeRegistry(path, data);
    expect(existsSync(path)).toBe(true);
    const loaded = readRegistry<SkillsRegistry>(path, { skills: {} });
    expect(loaded.skills['test-skill'].name).toBe('test-skill');
    expect(loaded.skills['test-skill'].validationStatus).toBe('pending');
  });

  it('overwrites existing registry data on write', () => {
    const path = join(tmpDir, 'skills.json');
    writeRegistry(path, {
      skills: {
        a: {
          name: 'a',
          sourcePath: '',
          origin: '',
          fileHash: '',
          importedAt: '',
          validationStatus: 'pending',
        },
      },
    });
    writeRegistry(path, {
      skills: {
        b: {
          name: 'b',
          sourcePath: '',
          origin: '',
          fileHash: '',
          importedAt: '',
          validationStatus: 'pending',
        },
      },
    });
    const loaded = readRegistry<SkillsRegistry>(path, { skills: {} });
    expect(loaded.skills.a).toBeUndefined();
    expect(loaded.skills.b).toBeDefined();
  });

  it('creates parent directories automatically', () => {
    const nestedPath = join(tmpDir, 'sub', 'skills.json');
    writeRegistry(nestedPath, { skills: {} });
    expect(existsSync(nestedPath)).toBe(true);
  });

  it('throws RegistryCorruptedError when file contains invalid JSON', () => {
    const path = join(tmpDir, 'corrupted.json');
    writeFileSync(path, '{broken json!!!', 'utf-8');
    expect(() => readRegistry(path, { skills: {} })).toThrow(RegistryCorruptedError);
  });

  it('RegistryCorruptedError includes the file path', () => {
    const path = join(tmpDir, 'bad.json');
    writeFileSync(path, 'not json', 'utf-8');
    try {
      readRegistry(path, {});
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RegistryCorruptedError);
      expect((err as RegistryCorruptedError).filePath).toBe(path);
    }
  });
});

describe('addSkillEntry', () => {
  it('adds a new skill entry to the registry file', () => {
    const path = join(tmpDir, 'skills.json');
    addSkillEntry(path, {
      name: 'my-skill',
      sourcePath: '/tmp/my-skill',
      origin: 'github',
      fileHash: 'def456',
      validationStatus: 'pass',
    });
    const loaded = readRegistry<SkillsRegistry>(path, { skills: {} });
    expect(loaded.skills['my-skill'].name).toBe('my-skill');
    expect(loaded.skills['my-skill'].origin).toBe('github');
  });

  it('detects duplicate skill name on add', () => {
    const path = join(tmpDir, 'skills.json');
    addSkillEntry(path, {
      name: 'dup',
      sourcePath: '/a',
      origin: '',
      fileHash: '',
      validationStatus: 'pending',
    });
    expect(() => {
      addSkillEntry(path, {
        name: 'dup',
        sourcePath: '/b',
        origin: '',
        fileHash: '',
        validationStatus: 'pending',
      });
    }).toThrow(/duplicate|already/i);
  });

  it('preserves existing entries when adding a new skill', () => {
    const path = join(tmpDir, 'skills.json');
    addSkillEntry(path, {
      name: 'first',
      sourcePath: '/a',
      origin: '',
      fileHash: '',
      validationStatus: 'pending',
    });
    addSkillEntry(path, {
      name: 'second',
      sourcePath: '/b',
      origin: '',
      fileHash: '',
      validationStatus: 'pending',
    });
    const loaded = readRegistry<SkillsRegistry>(path, { skills: {} });
    expect(Object.keys(loaded.skills)).toHaveLength(2);
  });
});
