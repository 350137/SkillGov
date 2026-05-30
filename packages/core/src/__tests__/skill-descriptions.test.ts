// Tests for bilingual skill description registry helpers and language fallback behavior.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RegistryCorruptedError } from '../registry.js';
import {
  detectDescriptionLanguage,
  readSkillDescriptions,
  resolveSkillDescription,
  upsertSkillDescription,
  writeSkillDescriptions,
} from '../skill-descriptions.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-skill-descriptions-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('skill description registry', () => {
  it('returns an empty registry when the file does not exist', () => {
    const registry = readSkillDescriptions(join(tmpDir, 'skill-descriptions.json'));

    expect(registry).toEqual({ version: 1, descriptions: {} });
  });

  it('writes and reads bilingual skill descriptions', () => {
    const registryPath = join(tmpDir, 'registry', 'skill-descriptions.json');

    writeSkillDescriptions(registryPath, {
      version: 1,
      descriptions: {
        brainstorming: {
          zh: '用于开发前梳理需求。',
          en: 'Explores requirements before implementation.',
          source: 'manual',
          reviewStatus: 'reviewed',
          updatedAt: '2026-05-30',
        },
      },
    });

    const loaded = readSkillDescriptions(registryPath);
    expect(loaded.descriptions.brainstorming.zh).toBe('用于开发前梳理需求。');
    expect(loaded.descriptions.brainstorming.en).toBe(
      'Explores requirements before implementation.',
    );
  });

  it('upserts a skill description without discarding existing fields', () => {
    const registryPath = join(tmpDir, 'skill-descriptions.json');

    upsertSkillDescription(registryPath, 'browser', {
      en: 'Controls the browser.',
      source: 'frontmatter',
      reviewStatus: 'missing',
      updatedAt: '2026-05-30',
    });
    upsertSkillDescription(registryPath, 'browser', {
      zh: '用于控制浏览器。',
      source: 'manual',
      reviewStatus: 'manual',
      updatedAt: '2026-05-31',
    });

    const entry = readSkillDescriptions(registryPath).descriptions.browser;
    expect(entry.en).toBe('Controls the browser.');
    expect(entry.zh).toBe('用于控制浏览器。');
    expect(entry.source).toBe('manual');
    expect(entry.reviewStatus).toBe('manual');
  });

  it('resolves descriptions using language preference and fallback text', () => {
    expect(
      resolveSkillDescription(
        { en: 'English description.', source: 'frontmatter', reviewStatus: 'missing' },
        'zh',
        'frontmatter fallback',
      ),
    ).toBe('English description.');
    expect(resolveSkillDescription(undefined, 'en', 'frontmatter fallback')).toBe(
      'frontmatter fallback',
    );
    expect(resolveSkillDescription(undefined, 'zh')).toBe('');
  });

  it('detects Chinese descriptions by character ratio', () => {
    expect(detectDescriptionLanguage('用于管理本地技能。')).toBe('zh');
    expect(detectDescriptionLanguage('Manage local agent skills.')).toBe('en');
  });

  it('throws RegistryCorruptedError for invalid JSON', () => {
    const registryPath = join(tmpDir, 'skill-descriptions.json');
    writeFileSync(registryPath, '{broken', 'utf-8');

    expect(() => readSkillDescriptions(registryPath)).toThrow(RegistryCorruptedError);
  });
});
