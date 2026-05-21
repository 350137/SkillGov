// Target compatibility checker — validates whether a standard skill can run on a target agent. Returns compatible, needs-overlay, unsupported, or unknown.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { getTargetProfile } from './targets.js';

export type CompatibilityStatus = 'compatible' | 'needs-overlay' | 'unsupported' | 'unknown';

export interface CompatibilityIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  category: 'target' | 'tool' | 'dependency' | 'script' | 'security';
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  skillName: string;
  targetName: string;
  issues: CompatibilityIssue[];
}

// Claude-specific tools not available in Codex
const CLAUDE_SPECIFIC_TOOLS = new Set(['computer', 'web_search', 'web_fetch']);

// Codex-specific tools not available in Claude
const CODEX_SPECIFIC_TOOLS = new Set<string>([]);

function detectToolsInMarkdown(content: string, frontmatterTools: string[]): string[] {
  const found = new Set<string>();
  for (const tool of frontmatterTools) {
    found.add(tool);
  }
  const toolPattern = /`([a-z_]+)`/g;
  for (let match = toolPattern.exec(content); match; match = toolPattern.exec(content)) {
    const word = match[1];
    if (CLAUDE_SPECIFIC_TOOLS.has(word) || CODEX_SPECIFIC_TOOLS.has(word)) {
      found.add(word);
    }
  }
  return [...found];
}

function parseToolsField(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  if (trimmed)
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

export function checkCompatibility(skillPath: string, targetName: string): CompatibilityResult {
  const issues: CompatibilityIssue[] = [];
  const target = getTargetProfile(targetName);

  if (!target) {
    return {
      status: 'unknown',
      skillName: '',
      targetName,
      issues: [
        { severity: 'error', message: `Unknown target: "${targetName}"`, category: 'target' },
      ],
    };
  }

  const skillMdPath = resolve(skillPath, 'SKILL.md');
  const fm = parseFrontmatter(skillMdPath);
  if (fm.errors.length > 0 && Object.keys(fm.data).length === 0) {
    return {
      status: 'unknown',
      skillName: '',
      targetName,
      issues: [
        {
          severity: 'error',
          message: `Cannot parse SKILL.md frontmatter: ${fm.errors.join('; ')}`,
          category: 'target',
        },
      ],
    };
  }

  const skillName = fm.data.name || basename(skillPath);
  const content = readFileSync(skillMdPath, 'utf-8');

  // 1. Check compatibility field
  const compatibilityRaw = fm.data.compatibility;
  if (compatibilityRaw) {
    const compLower = compatibilityRaw.toLowerCase().replace(/['"]/g, '').trim();
    if (compLower === 'claude-only' || compLower === 'claude') {
      if (targetName !== 'claude') {
        issues.push({
          severity: 'warning',
          message: `Skill declares compatibility with Claude only, but target is "${targetName}".`,
          category: 'target',
        });
      }
    } else if (compLower === 'codex-only' || compLower === 'codex') {
      if (targetName !== 'codex') {
        issues.push({
          severity: 'warning',
          message: `Skill declares compatibility with Codex only, but target is "${targetName}".`,
          category: 'target',
        });
      }
    } else if (compLower === 'none' || compLower === 'unsupported') {
      issues.push({
        severity: 'error',
        message: 'Skill declares itself as unsupported on all targets.',
        category: 'target',
      });
    }
  }

  // 2. Check allowed-tools references
  const toolsRaw = fm.data['allowed-tools'] || fm.data.allowed_tools || '';
  const declaredTools = toolsRaw ? parseToolsField(toolsRaw) : [];
  const detectedTools = detectToolsInMarkdown(content, declaredTools);

  for (const tool of detectedTools) {
    if (targetName === 'codex' && CLAUDE_SPECIFIC_TOOLS.has(tool)) {
      issues.push({
        severity: 'warning',
        message: `Tool "${tool}" is Claude-specific and may not be available on Codex.`,
        category: 'tool',
      });
    }
    if (targetName === 'claude' && CODEX_SPECIFIC_TOOLS.has(tool)) {
      issues.push({
        severity: 'warning',
        message: `Tool "${tool}" is Codex-specific and may not be available on Claude.`,
        category: 'tool',
      });
    }
  }

  // 3. Check MCP dependencies
  const mcpRaw = fm.data['mcp-servers'] || fm.data.mcp_servers || '';
  if (mcpRaw) {
    const mcpServers = parseToolsField(mcpRaw);
    for (const server of mcpServers) {
      issues.push({
        severity: 'warning',
        message: `MCP server dependency "${server}" may not be available on ${targetName}. An overlay may be needed.`,
        category: 'dependency',
      });
    }
  }

  // 4. Check CLI dependencies
  const cliRaw = fm.data['cli-dependencies'] || fm.data.cli_dependencies || '';
  if (cliRaw) {
    const cliDeps = parseToolsField(cliRaw);
    for (const dep of cliDeps) {
      issues.push({
        severity: 'warning',
        message: `CLI dependency "${dep}" may not be available on ${targetName}. An overlay may be needed.`,
        category: 'dependency',
      });
    }
  }

  // 5. Check script runtimes
  const scriptsRaw = fm.data.scripts || '';
  if (scriptsRaw) {
    const scripts = parseToolsField(scriptsRaw);
    for (const script of scripts) {
      if (script.endsWith('.py')) {
        issues.push({
          severity: 'warning',
          message: `Python script "${script}" requires Python runtime. Verify ${targetName} supports it.`,
          category: 'script',
        });
      }
    }
  }

  // 6. Check target-specific wording in markdown
  if (targetName === 'codex' && /\bclaude\b/i.test(content)) {
    issues.push({
      severity: 'warning',
      message:
        'Markdown references "Claude" — may contain Claude-specific instructions needing overlay.',
      category: 'target',
    });
  }
  if (targetName === 'claude' && /\bcodex\b/i.test(content)) {
    issues.push({
      severity: 'warning',
      message:
        'Markdown references "Codex" — may contain Codex-specific instructions needing overlay.',
      category: 'target',
    });
  }

  // Determine final status
  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');

  let status: CompatibilityStatus;
  if (hasErrors) {
    status = 'unsupported';
  } else if (hasWarnings) {
    status = 'needs-overlay';
  } else if (issues.length === 0) {
    status = 'compatible';
  } else {
    // Only info-level issues
    status = 'compatible';
  }

  return { status, skillName, targetName, issues };
}
