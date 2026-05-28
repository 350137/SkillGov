// Target compatibility checker validates whether a standard skill can run on a target agent.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { getMappingTargets } from './mapping.js';
import { getTargetProfile } from './targets.js';
import type { CapabilitySupport, TargetProfile } from './targets.js';

export type CompatibilityStatus =
  | 'compatible'
  | 'needs-mapping'
  | 'needs-overlay'
  | 'unsupported'
  | 'unknown';

export interface CompatibilityIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  category:
    | 'structure'
    | 'target'
    | 'mapping'
    | 'capability'
    | 'tool'
    | 'dependency'
    | 'script'
    | 'security';
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  skillName: string;
  targetName: string;
  issues: CompatibilityIssue[];
}

export interface CompatibilityOptions {
  targetProfiles?: TargetProfile[];
  mappingsPath?: string;
}

const CLAUDE_SPECIFIC_TOOLS = new Set(['computer', 'web_search', 'web_fetch']);
const CODEX_SPECIFIC_TOOLS = new Set<string>([]);

type CapabilityKey =
  | 'agents'
  | 'mcp'
  | 'hooks'
  | 'dynamicShell'
  | 'skillPermissions'
  | 'modelSelection';

interface CapabilityRule {
  fields: string[];
  capability: CapabilityKey;
  label: string;
}

const CAPABILITY_FIELD_RULES: CapabilityRule[] = [
  { fields: ['agent', 'agents', 'subagent'], capability: 'agents', label: 'agent routing' },
  { fields: ['hooks'], capability: 'hooks', label: 'skill hooks' },
  { fields: ['shell'], capability: 'dynamicShell', label: 'skill-level shell execution' },
  {
    fields: ['model', 'effort'],
    capability: 'modelSelection',
    label: 'skill-level model settings',
  },
];

const EXPLICIT_TARGET_BINDINGS: Record<string, RegExp[]> = {
  claude: [
    /\bclaude[- ]only\b/i,
    /\brequires\s+claude(?:\s+code)?\b/i,
    /\bonly\s+(?:works|runs)\s+(?:with|in|on)\s+claude(?:\s+code)?\b/i,
    /\bmust\s+(?:run|be used)\s+(?:with|in|on)\s+claude(?:\s+code)?\b/i,
    /\bclaude[- ]specific\s+(?:tool|tools|hook|hooks|agent|agents|command|commands|permission|permissions|runtime|feature|features)\b/i,
    /(?:^|[\s`"'(])~?\/?\.claude[\\/]/i,
    /\bCLAUDE_[A-Z0-9_]+\b/,
  ],
  codex: [
    /\bcodex[- ]only\b/i,
    /\brequires\s+codex\b/i,
    /\bonly\s+(?:works|runs)\s+(?:with|in|on)\s+codex\b/i,
    /\bmust\s+(?:run|be used)\s+(?:with|in|on)\s+codex\b/i,
    /\bcodex[- ]specific\s+(?:tool|tools|hook|hooks|agent|agents|command|commands|permission|permissions|runtime|feature|features)\b/i,
    /(?:^|[\s`"'(])~?\/?\.codex[\\/]/i,
    /\bCODEX_[A-Z0-9_]+\b/,
  ],
};

function targetIdFor(target: TargetProfile | null, targetName: string): string {
  return (target?.id || targetName).toLowerCase();
}

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
  if (trimmed) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function getCapabilitySupport(
  target: TargetProfile | null,
  capability: CapabilityKey,
): CapabilitySupport {
  return target?.supports[capability] || 'unknown';
}

function addCapabilityIssue(
  issues: CompatibilityIssue[],
  target: TargetProfile | null,
  targetName: string,
  capability: CapabilityKey,
  label: string,
): void {
  const support = getCapabilitySupport(target, capability);
  if (support === 'native' || support === 'mapped') return;
  issues.push({
    severity: support === 'none' ? 'warning' : 'info',
    message:
      support === 'none'
        ? `Skill declares ${label}, but "${targetName}" does not support that capability directly.`
        : `Skill declares ${label}; support on "${targetName}" is unknown and should be reviewed.`,
    category: 'capability',
  });
}

function hasFrontmatterValue(data: Record<string, string>, field: string): boolean {
  const value = data[field];
  return typeof value === 'string' && value.trim().length > 0;
}

function checkCapabilityFields(
  data: Record<string, string>,
  content: string,
  target: TargetProfile | null,
  targetName: string,
  issues: CompatibilityIssue[],
): void {
  for (const rule of CAPABILITY_FIELD_RULES) {
    if (rule.fields.some((field) => hasFrontmatterValue(data, field))) {
      addCapabilityIssue(issues, target, targetName, rule.capability, rule.label);
    }
  }

  if (hasFrontmatterValue(data, 'context') && /\bfork\b/i.test(data.context)) {
    addCapabilityIssue(issues, target, targetName, 'agents', 'forked agent context');
  }

  if (/!`[^`]+`/.test(content)) {
    addCapabilityIssue(issues, target, targetName, 'dynamicShell', 'dynamic shell context');
  }
}

function checkExplicitTargetBindings(
  content: string,
  targetName: string,
  issues: CompatibilityIssue[],
): void {
  const normalizedTarget = targetName.toLowerCase();
  for (const [boundTarget, patterns] of Object.entries(EXPLICIT_TARGET_BINDINGS)) {
    if (boundTarget === normalizedTarget) continue;
    if (!patterns.some((pattern) => pattern.test(content))) continue;
    issues.push({
      severity: 'warning',
      message: `Markdown contains explicit ${boundTarget} binding. An overlay may be needed for "${targetName}".`,
      category: 'target',
    });
  }
}

function checkRequiredFrontmatter(
  data: Record<string, string>,
  target: TargetProfile | null,
  issues: CompatibilityIssue[],
): void {
  if (!target?.supports.skillMd) return;
  for (const field of ['name', 'description']) {
    if (!hasFrontmatterValue(data, field)) {
      issues.push({
        severity: 'error',
        message: `Missing required frontmatter field "${field}".`,
        category: 'structure',
      });
    }
  }
}

function statusFromIssues(issues: CompatibilityIssue[]): CompatibilityStatus {
  if (issues.some((i) => i.severity === 'error')) return 'unsupported';
  if (issues.some((i) => i.severity === 'warning' && i.category !== 'mapping')) {
    return 'needs-overlay';
  }
  if (issues.some((i) => i.severity === 'warning' && i.category === 'mapping')) {
    return 'needs-mapping';
  }
  return 'compatible';
}

function checkMappingStatus(
  skillName: string,
  targetName: string,
  options: CompatibilityOptions,
  issues: CompatibilityIssue[],
): void {
  if (!options.mappingsPath) return;
  const targetMappings = getMappingTargets(skillName, options.mappingsPath);
  const targetMapping = targetMappings.find((mapping) => mapping.target === targetName);
  if (targetMapping?.status === 'linked') return;

  issues.push({
    severity: 'warning',
    message: targetMapping
      ? `Skill mapping for "${targetName}" is "${targetMapping.status}". Remap before use.`
      : `Skill is compatible but is not mapped to "${targetName}" yet.`,
    category: 'mapping',
  });
}

export function checkCompatibility(
  skillPath: string,
  targetName: string,
  options: CompatibilityOptions = {},
): CompatibilityResult {
  const issues: CompatibilityIssue[] = [];
  const target = getTargetProfile(targetName, options.targetProfiles);
  const targetId = targetIdFor(target, targetName);

  if (!target) {
    issues.push({
      severity: 'info',
      message: `Unknown target: "${targetName}". Generic compatibility checks applied.`,
      category: 'target',
    });
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
          category: 'structure',
        },
      ],
    };
  }

  const skillName = fm.data.name || basename(skillPath);
  const content = readFileSync(skillMdPath, 'utf-8');

  checkRequiredFrontmatter(fm.data, target, issues);

  const compatibilityRaw = fm.data.compatibility;
  if (compatibilityRaw) {
    const compLower = compatibilityRaw.toLowerCase().replace(/['"]/g, '').trim();
    if ((compLower === 'claude-only' || compLower === 'claude') && targetId !== 'claude') {
      issues.push({
        severity: 'warning',
        message: `Skill declares compatibility with Claude only, but target is "${targetName}".`,
        category: 'target',
      });
    } else if ((compLower === 'codex-only' || compLower === 'codex') && targetId !== 'codex') {
      issues.push({
        severity: 'warning',
        message: `Skill declares compatibility with Codex only, but target is "${targetName}".`,
        category: 'target',
      });
    } else if (compLower === 'none' || compLower === 'unsupported') {
      issues.push({
        severity: 'error',
        message: 'Skill declares itself as unsupported on all targets.',
        category: 'target',
      });
    }
  }

  const toolsRaw = fm.data['allowed-tools'] || fm.data.allowed_tools || '';
  const declaredTools = toolsRaw ? parseToolsField(toolsRaw) : [];
  const detectedTools = detectToolsInMarkdown(content, declaredTools);
  if (toolsRaw && target?.supports.allowedTools === 'none') {
    issues.push({
      severity: 'warning',
      message: `Skill declares allowed-tools, but "${targetName}" does not support skill-level tool permissions.`,
      category: 'capability',
    });
  }

  for (const tool of detectedTools) {
    if (targetId === 'codex' && CLAUDE_SPECIFIC_TOOLS.has(tool)) {
      issues.push({
        severity: 'warning',
        message: `Tool "${tool}" is Claude-specific and may not be available on Codex.`,
        category: 'tool',
      });
    }
    if (targetId === 'claude' && CODEX_SPECIFIC_TOOLS.has(tool)) {
      issues.push({
        severity: 'warning',
        message: `Tool "${tool}" is Codex-specific and may not be available on Claude.`,
        category: 'tool',
      });
    }
  }

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

  checkCapabilityFields(fm.data, content, target, targetName, issues);
  checkExplicitTargetBindings(content, targetId, issues);
  checkMappingStatus(skillName, targetId, options, issues);

  return { status: statusFromIssues(issues), skillName, targetName, issues };
}
