// Simple frontmatter parser for SKILL.md — extracts YAML key-value pairs between --- delimiters and returns structured data or errors.
import { existsSync, readFileSync } from 'node:fs';

export interface FrontmatterResult {
  data: Record<string, string>;
  errors: string[];
}

function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseFrontmatter(filePath: string): FrontmatterResult {
  const data: Record<string, string> = {};
  const errors: string[] = [];

  if (!existsSync(filePath)) {
    return { data: {}, errors: [`File not found: ${filePath}`] };
  }

  const content = readFileSync(filePath, 'utf-8');

  if (!content.startsWith('---')) {
    return { data: {}, errors: ['No frontmatter block found: file must start with ---'] };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { data: {}, errors: ['Unclosed frontmatter block: missing closing ---'] };
  }

  const raw = content.slice(3, endIndex).trim();
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      errors.push(`Unparseable frontmatter line: "${trimmed}"`);
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (!key) {
      errors.push(`Unparseable frontmatter line: "${trimmed}"`);
      continue;
    }

    data[key] = stripQuotes(value);
  }

  return { data, errors };
}
