// Standard Agent Skill validator — checks structure, frontmatter, required fields, references, and path safety. Returns pass, fixable, or fail.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  field?: string;
}

export interface ValidationResult {
  status: 'pass' | 'fixable' | 'fail';
  issues: ValidationIssue[];
  skillName?: string;
}

const LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

// Matches absolute paths starting with / or drive letters (C:\). Use hex escape for backtick to avoid esbuild conflicts.
const ABSOLUTE_PATH_REGEX = /(?:^|[\s\x60])([A-Z]:\\[^\s\x60<>"|]+|\/[^\s\x60<>"|]+)/g;

function isLocalMarkdownReference(linkTarget: string): boolean {
  const target = linkTarget.trim();
  if (!target || target.startsWith('#')) return false;
  if (target === 'IMAGE_LINK') return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return false;
  if (target.startsWith('/')) return false;
  return true;
}

function findMarkdownFiles(dir: string, maxDepth = 2): string[] {
  const results: string[] = [];
  function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = resolve(current, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (entry !== 'node_modules' && entry !== '.git') {
          walk(full, depth + 1);
        }
      } else if (entry.endsWith('.md') || entry.endsWith('.markdown')) {
        results.push(full);
      }
    }
  }
  walk(dir, 0);
  return results;
}

export function validateSkill(skillPath: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const skillMdPath = resolve(skillPath, 'SKILL.md');

  // 1. SKILL.md exists
  if (!existsSync(skillMdPath)) {
    issues.push({ severity: 'error', message: `SKILL.md not found at "${skillMdPath}"` });
    return { status: 'fail', issues };
  }

  // 2. Parse frontmatter
  const fm = parseFrontmatter(skillMdPath);
  if (fm.errors.length > 0 && Object.keys(fm.data).length === 0) {
    issues.push({ severity: 'error', message: `Invalid frontmatter: ${fm.errors.join('; ')}` });
    return { status: 'fail', issues };
  }
  for (const err of fm.errors) {
    issues.push({ severity: 'warning', message: err });
  }

  // 3. Required fields: name
  const name = fm.data.name;
  if (!name) {
    issues.push({
      severity: 'error',
      message: 'Required field "name" is missing in SKILL.md frontmatter.',
      field: 'name',
    });
  }

  // 4. Required fields: description
  const description = fm.data.description;
  if (!description) {
    issues.push({
      severity: 'error',
      message: 'Required field "description" is missing in SKILL.md frontmatter.',
      field: 'description',
    });
  }

  // If required fields are missing, fail early
  if (!name || !description) {
    return { status: 'fail', issues };
  }

  // 5. Name stability: name matches directory name
  const dirName = basename(skillPath);
  if (name !== dirName) {
    issues.push({
      severity: 'warning',
      message: `Skill name "${name}" does not match directory name "${dirName}". Consider renaming to match.`,
    });
  }

  // 6. Referenced files exist (scan all .md files for links)
  const skillDir = dirname(skillMdPath);
  const mdFiles = findMarkdownFiles(skillDir);

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, 'utf-8');
    const relativeDir = dirname(relative(skillDir, mdFile));

    LINK_REGEX.lastIndex = 0;

    for (let match = LINK_REGEX.exec(content); match; match = LINK_REGEX.exec(content)) {
      const linkTarget = match[2];

      if (!isLocalMarkdownReference(linkTarget)) {
        continue;
      }

      const resolvedPath = resolve(skillDir, relativeDir, linkTarget);
      if (!existsSync(resolvedPath)) {
        issues.push({
          severity: 'warning',
          message: `Referenced file "${linkTarget}" not found (resolved to "${resolvedPath}").`,
        });
      }
    }
  }

  // 7. Dangerous absolute paths
  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, 'utf-8');
    ABSOLUTE_PATH_REGEX.lastIndex = 0;

    for (
      let match = ABSOLUTE_PATH_REGEX.exec(content);
      match;
      match = ABSOLUTE_PATH_REGEX.exec(content)
    ) {
      const path = match[1];
      // Only flag known dangerous system paths
      const dangerous = ['/usr/bin/', '/bin/', 'C:\\Windows\\', '/etc/', '/usr/sbin/'];
      if (dangerous.some((d) => path.toLowerCase().includes(d.toLowerCase()))) {
        issues.push({
          severity: 'warning',
          message: `Dangerous absolute path found: "${path}". Use relative paths instead.`,
        });
      }
    }
  }

  // Determine final status
  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');

  let status: 'pass' | 'fixable' | 'fail';
  if (hasErrors) {
    status = 'fail';
  } else if (hasWarnings) {
    status = 'fixable';
  } else {
    status = 'pass';
  }

  return { status, issues, skillName: name };
}
