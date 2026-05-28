// Tests for config loading, validation, path normalization, and dry-run mode.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for config loading, validation, path normalization, and dry-run mode.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type SkillGovConfig,
  defaultConfig,
  loadConfig,
  normalizePath,
  writeConfig,
} from '../config.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-test-config-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('defaultConfig', () => {
  it('returns default config with project root set to cwd when not specified', () => {
    const cfg = defaultConfig();
    expect(cfg.projectRoot).toBe(normalizePath(process.cwd()));
    expect(cfg.defaultLinkMode).toBe('junction');
    expect(cfg.targets).toEqual(['claude', 'codex']);
  });

  it('returns default config with specified project root', () => {
    const cfg = defaultConfig(tmpDir);
    expect(cfg.projectRoot).toBe(normalizePath(tmpDir));
  });

  it('has targets array that includes claude and codex', () => {
    const cfg = defaultConfig();
    expect(cfg.targets).toContain('claude');
    expect(cfg.targets).toContain('codex');
  });
});

describe('loadConfig', () => {
  it('returns default config when config file does not exist', () => {
    const cfg = loadConfig(join(tmpDir, 'nonexistent.json'));
    expect(cfg.projectRoot).toBe(normalizePath(process.cwd()));
    expect(cfg.defaultLinkMode).toBe('junction');
  });

  it('loads config from a valid JSON file', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({ projectRoot: tmpDir, defaultLinkMode: 'symlink', targets: ['claude'] }),
      'utf-8',
    );
    const cfg = loadConfig(configPath);
    expect(cfg.projectRoot).toBe(normalizePath(tmpDir));
    expect(cfg.defaultLinkMode).toBe('symlink');
    expect(cfg.targets).toEqual(['claude']);
  });

  it('reports a clear error when config file contains invalid JSON', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(configPath, '{ invalid json }', 'utf-8');
    expect(() => loadConfig(configPath)).toThrow(/config|invalid|parse|JSON/i);
  });

  it('normalizes Windows backslash paths to forward slashes', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(configPath, JSON.stringify({ projectRoot: 'C:\\Users\\test\\project' }), 'utf-8');
    const cfg = loadConfig(configPath);
    expect(cfg.projectRoot).not.toContain('\\');
    expect(cfg.projectRoot).toContain('/');
  });

  it('preserves Unix forward-slash paths unchanged', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(configPath, JSON.stringify({ projectRoot: tmpDir.replace(/\\/g, '/') }), 'utf-8');
    const cfg = loadConfig(configPath);
    expect(cfg.projectRoot).toBe(tmpDir.replace(/\\/g, '/'));
  });

  it('merges partial user config with defaults', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(configPath, JSON.stringify({ targets: ['codex'] }), 'utf-8');
    const cfg = loadConfig(configPath);
    // Should keep defaults for unspecified fields
    expect(cfg.projectRoot).toBe(normalizePath(process.cwd()));
    expect(cfg.defaultLinkMode).toBe('junction');
    // Should use the specified field
    expect(cfg.targets).toEqual(['codex']);
  });

  it('rejects invalid defaultLinkMode values', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(configPath, JSON.stringify({ defaultLinkMode: 'invalid' }), 'utf-8');
    expect(() => loadConfig(configPath)).toThrow(/linkMode/i);
  });

  it('accepts targets as object array with id, label, skillDirs', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        targets: [
          { id: 'opencode', label: 'OpenCode', skillDirs: ['D:/OpenCode/skills'] },
        ],
      }),
      'utf-8',
    );
    const cfg = loadConfig(configPath);
    expect(cfg.targets).toHaveLength(1);
    const t = cfg.targets[0] as { id: string; label: string; skillDirs: string[] };
    expect(t.id).toBe('opencode');
    expect(t.label).toBe('OpenCode');
  });

  it('accepts mixed string and object targets', () => {
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        targets: ['claude', { id: 'opencode', label: 'OpenCode', skillDirs: ['D:/OpenCode/skills'] }],
      }),
      'utf-8',
    );
    const cfg = loadConfig(configPath);
    expect(cfg.targets).toHaveLength(2);
    expect(cfg.targets[0]).toBe('claude');
    expect((cfg.targets[1] as { id: string }).id).toBe('opencode');
  });
});

describe('writeConfig', () => {
  it('writes config to disk and can be read back', () => {
    const config: SkillGovConfig = {
      projectRoot: tmpDir,
      defaultLinkMode: 'symlink',
      targets: ['claude'],
    };
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeConfig(config, configPath);
    expect(existsSync(configPath)).toBe(true);
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(raw.projectRoot).toBe(tmpDir);
    expect(raw.defaultLinkMode).toBe('symlink');
  });

  it('does not write to disk when dryRun is true', () => {
    const config: SkillGovConfig = {
      projectRoot: tmpDir,
      defaultLinkMode: 'junction',
      targets: ['claude', 'codex'],
    };
    const configPath = join(tmpDir, 'skillgov.config.json');
    writeConfig(config, configPath, true);
    expect(existsSync(configPath)).toBe(false);
  });
});
