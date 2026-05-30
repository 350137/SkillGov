// Skill description workflow helpers for generating registries and exchanging translation CSV files.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import {
  type SkillDescriptionEntry,
  type SkillDescriptionLanguage,
  type SkillDescriptionReviewStatus,
  type SkillDescriptionSource,
  detectDescriptionLanguage,
  readSkillDescriptions,
  writeSkillDescriptions,
} from './skill-descriptions.js';

export interface GenerateSkillDescriptionTableOptions {
  skillsDir: string;
  registryPath: string;
  now?: string;
}

export interface GenerateSkillDescriptionTableResult {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface ExportTranslationWorklistOptions {
  registryPath: string;
  outputPath: string;
}

export interface ExportTranslationWorklistResult {
  exported: number;
}

export interface ApplyTranslationCsvOptions {
  registryPath: string;
  csvPath: string;
  overwrite?: boolean;
  source?: SkillDescriptionSource;
  reviewed?: boolean;
  now?: string;
}

export interface ApplyTranslationCsvResult {
  applied: number;
  skipped: number;
}

interface TranslationRow {
  skill: string;
  sourceLanguage: SkillDescriptionLanguage | '';
  targetLanguage: SkillDescriptionLanguage;
  sourceText: string;
  targetText: string;
  reviewStatus: SkillDescriptionReviewStatus | '';
}

export function generateSkillDescriptionTable(
  options: GenerateSkillDescriptionTableOptions,
): GenerateSkillDescriptionTableResult {
  const now = options.now || new Date().toISOString();
  const registry = readSkillDescriptions(options.registryPath);
  const result: GenerateSkillDescriptionTableResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  if (!existsSync(options.skillsDir)) {
    return result;
  }

  for (const entryName of readdirSync(options.skillsDir)) {
    const skillDir = join(options.skillsDir, entryName);
    if (!isDirectory(skillDir)) continue;
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    result.scanned++;
    const frontmatter = parseFrontmatter(skillFile);
    const skillName = frontmatter.data.name || entryName;
    const description = frontmatter.data.description || '';
    if (!description) {
      result.skipped++;
      continue;
    }

    const language = detectDescriptionLanguage(description);
    const existing = registry.descriptions[skillName];
    if (!existing) {
      registry.descriptions[skillName] = createFrontmatterEntry(language, description, now);
      result.created++;
      continue;
    }

    if (existing[language]) {
      result.skipped++;
      continue;
    }

    registry.descriptions[skillName] = {
      ...existing,
      [language]: description,
      updatedAt: now,
    };
    result.updated++;
  }

  writeSkillDescriptions(options.registryPath, registry);
  return result;
}

export function exportTranslationWorklist(
  options: ExportTranslationWorklistOptions,
): ExportTranslationWorklistResult {
  const registry = readSkillDescriptions(options.registryPath);
  const rows: string[][] = [
    ['skill', 'sourceLanguage', 'targetLanguage', 'sourceText', 'targetText', 'reviewStatus'],
  ];
  let exported = 0;

  for (const [skill, entry] of Object.entries(registry.descriptions).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const missing = missingLanguage(entry);
    if (!missing) continue;
    const sourceLanguage = missing === 'zh' ? (entry.en ? 'en' : '') : entry.zh ? 'zh' : '';
    const sourceText = sourceLanguage ? entry[sourceLanguage] || '' : '';
    rows.push([skill, sourceLanguage, missing, sourceText, '', entry.reviewStatus]);
    exported++;
  }

  ensureParentDir(options.outputPath);
  writeFileSync(options.outputPath, rows.map(formatCsvRow).join('\n'), 'utf-8');
  return { exported };
}

export function applyTranslationCsv(
  options: ApplyTranslationCsvOptions,
): ApplyTranslationCsvResult {
  const registry = readSkillDescriptions(options.registryPath);
  const rows = parseTranslationRows(readFileSync(options.csvPath, 'utf-8'));
  const now = options.now || new Date().toISOString();
  let applied = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.skill || !row.targetLanguage || !row.targetText.trim()) {
      skipped++;
      continue;
    }

    const existing = registry.descriptions[row.skill] || {
      source: 'machine',
      reviewStatus: 'missing',
    };
    if (!options.overwrite && existing[row.targetLanguage]) {
      skipped++;
      continue;
    }

    registry.descriptions[row.skill] = {
      ...existing,
      [row.targetLanguage]: row.targetText,
      source: options.source || 'machine',
      reviewStatus: options.reviewed
        ? 'reviewed'
        : options.source === 'manual'
          ? 'manual'
          : 'machine',
      updatedAt: now,
    };
    applied++;
  }

  writeSkillDescriptions(options.registryPath, registry);
  return { applied, skipped };
}

function createFrontmatterEntry(
  language: SkillDescriptionLanguage,
  description: string,
  now: string,
): SkillDescriptionEntry {
  return {
    [language]: description,
    source: 'frontmatter',
    reviewStatus: 'missing',
    updatedAt: now,
  };
}

function missingLanguage(entry: SkillDescriptionEntry): SkillDescriptionLanguage | undefined {
  if (!entry.zh) return 'zh';
  if (!entry.en) return 'en';
  return undefined;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function ensureParentDir(filePath: string): void {
  const parent = dirname(filePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function formatCsvRow(values: string[]): string {
  return values.map(formatCsvCell).join(',');
}

function formatCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseTranslationRows(csv: string): TranslationRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const header = rows[0];
  const index = new Map(header.map((name, i) => [name, i]));
  return rows.slice(1).map((row) => ({
    skill: cell(row, index, 'skill'),
    sourceLanguage: cell(row, index, 'sourceLanguage') as SkillDescriptionLanguage | '',
    targetLanguage: cell(row, index, 'targetLanguage') as SkillDescriptionLanguage,
    sourceText: cell(row, index, 'sourceText'),
    targetText: cell(row, index, 'targetText'),
    reviewStatus: cell(row, index, 'reviewStatus') as SkillDescriptionReviewStatus | '',
  }));
}

function cell(row: string[], index: Map<string, number>, key: string): string {
  const position = index.get(key);
  return position == null ? '' : row[position] || '';
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];

    if (inQuotes && char === '"' && next === '"') {
      cellValue += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === ',') {
      row.push(cellValue);
      cellValue = '';
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i++;
      row.push(cellValue);
      rows.push(row);
      row = [];
      cellValue = '';
      continue;
    }
    cellValue += char;
  }

  if (cellValue || row.length > 0) {
    row.push(cellValue);
    rows.push(row);
  }
  return rows;
}
