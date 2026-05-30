// Tests for generating bilingual skill descriptions and round-tripping translation CSV worklists.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyTranslationCsv,
  exportTranslationWorklist,
  generateSkillDescriptionTable,
} from '../skill-description-workflow.js';
import { readSkillDescriptions, writeSkillDescriptions } from '../skill-descriptions.js';

let tmpDir: string;
let skillsDir: string;
let registryPath: string;

function writeSkill(name: string, description?: string): void {
  const skillDir = join(skillsDir, name);
  mkdirSync(skillDir, { recursive: true });
  const descriptionLine = description ? `description: "${description}"\n` : '';
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\n${descriptionLine}---\n\n# ${name}\n`,
    'utf-8',
  );
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-description-workflow-${randomUUID()}`);
  skillsDir = join(tmpDir, 'skills');
  registryPath = join(tmpDir, 'registry', 'skill-descriptions.json');
  mkdirSync(skillsDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateSkillDescriptionTable', () => {
  it('creates registry entries from skill frontmatter descriptions', () => {
    writeSkill('alpha', 'Manage local agent skills.');
    writeSkill('beta', '用于管理本地技能。');
    mkdirSync(join(skillsDir, 'not-a-skill'), { recursive: true });

    const result = generateSkillDescriptionTable({
      skillsDir,
      registryPath,
      now: '2026-05-30T00:00:00.000Z',
    });

    const registry = readSkillDescriptions(registryPath);
    expect(result).toEqual({ scanned: 2, created: 2, updated: 0, skipped: 0 });
    expect(registry.descriptions.alpha.en).toBe('Manage local agent skills.');
    expect(registry.descriptions.beta.zh).toBe('用于管理本地技能。');
    expect(registry.descriptions['not-a-skill']).toBeUndefined();
  });

  it('fills missing languages without overwriting reviewed manual descriptions', () => {
    writeSkill('alpha', 'Manage local agent skills.');
    writeSkillDescriptions(registryPath, {
      version: 1,
      descriptions: {
        alpha: {
          zh: '人工维护的中文说明。',
          source: 'manual',
          reviewStatus: 'reviewed',
          updatedAt: '2026-05-29T00:00:00.000Z',
        },
      },
    });

    const result = generateSkillDescriptionTable({
      skillsDir,
      registryPath,
      now: '2026-05-30T00:00:00.000Z',
    });

    const entry = readSkillDescriptions(registryPath).descriptions.alpha;
    expect(result).toEqual({ scanned: 1, created: 0, updated: 1, skipped: 0 });
    expect(entry.zh).toBe('人工维护的中文说明。');
    expect(entry.en).toBe('Manage local agent skills.');
    expect(entry.reviewStatus).toBe('reviewed');
  });
});

describe('translation CSV workflow', () => {
  it('exports only missing language rows with valid CSV escaping', () => {
    writeSkillDescriptions(registryPath, {
      version: 1,
      descriptions: {
        alpha: {
          en: 'Manage, govern, and "map" skills.',
          source: 'frontmatter',
          reviewStatus: 'missing',
          updatedAt: '2026-05-30T00:00:00.000Z',
        },
        beta: {
          zh: '已经有中文和英文。',
          en: 'Already has both.',
          source: 'manual',
          reviewStatus: 'reviewed',
          updatedAt: '2026-05-30T00:00:00.000Z',
        },
      },
    });

    const csvPath = join(tmpDir, 'reports', 'worklist.csv');
    const result = exportTranslationWorklist({ registryPath, outputPath: csvPath });

    const csv = readFileSync(csvPath, 'utf-8');
    expect(result).toEqual({ exported: 1 });
    expect(csv).toContain('skill,sourceLanguage,targetLanguage,sourceText,targetText,reviewStatus');
    expect(csv).toContain('"Manage, govern, and ""map"" skills."');
    expect(csv).toContain('alpha,en,zh');
    expect(csv).not.toContain('beta');
  });

  it('applies translated CSV rows without overwriting existing text by default', () => {
    writeSkillDescriptions(registryPath, {
      version: 1,
      descriptions: {
        alpha: {
          en: 'Manage skills.',
          zh: '已有中文。',
          source: 'manual',
          reviewStatus: 'manual',
          updatedAt: '2026-05-30T00:00:00.000Z',
        },
        beta: {
          en: 'Check browsers.',
          source: 'frontmatter',
          reviewStatus: 'missing',
          updatedAt: '2026-05-30T00:00:00.000Z',
        },
      },
    });
    const csvPath = join(tmpDir, 'translations.csv');
    writeFileSync(
      csvPath,
      [
        'skill,sourceLanguage,targetLanguage,sourceText,targetText,reviewStatus',
        'alpha,en,zh,Manage skills.,新中文,machine',
        'beta,en,zh,Check browsers.,检查浏览器,machine',
      ].join('\n'),
      'utf-8',
    );

    const result = applyTranslationCsv({
      registryPath,
      csvPath,
      now: '2026-05-31T00:00:00.000Z',
    });

    const registry = readSkillDescriptions(registryPath);
    expect(result).toEqual({ applied: 1, skipped: 1 });
    expect(registry.descriptions.alpha.zh).toBe('已有中文。');
    expect(registry.descriptions.beta.zh).toBe('检查浏览器');
    expect(registry.descriptions.beta.source).toBe('machine');
    expect(registry.descriptions.beta.reviewStatus).toBe('machine');
  });
});
