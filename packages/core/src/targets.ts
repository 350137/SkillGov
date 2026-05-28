// Target profile definitions for supported agent platforms — resolves home directories and provides default settings for Claude Code and Codex.
import { homedir } from 'node:os';

export interface TargetSupports {
  skillMd: boolean;
  allowedTools: 'partial' | 'full' | 'none';
  scripts: 'unknown' | 'supported' | 'unsupported';
}

export interface TargetProfile {
  id: string;
  label: string;
  skillDirs: string[];
  linkMode: 'junction' | 'symlink' | 'copy';
  supports: TargetSupports;
}

export type TargetEntry = string | { id: string; label: string; skillDirs: string[] };

function expandHome(p: string): string {
  return p.replace(/^~/, homedir().replace(/\\/g, '/'));
}

const DEFAULT_TARGETS: Record<string, TargetProfile> = {
  claude: {
    id: 'claude',
    label: 'Claude',
    skillDirs: [expandHome('~/.claude/skills')],
    linkMode: 'junction',
    supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    skillDirs: [expandHome('~/.codex/skills')],
    linkMode: 'junction',
    supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
  },
};

function resolveTargetEntry(entry: TargetEntry): TargetProfile {
  if (typeof entry === 'string') {
    return DEFAULT_TARGETS[entry] ?? { id: entry, label: entry, skillDirs: [], linkMode: 'junction', supports: { skillMd: false, allowedTools: 'none', scripts: 'unknown' } };
  }
  return {
    id: entry.id,
    label: entry.label,
    skillDirs: entry.skillDirs,
    linkMode: 'junction',
    supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
  };
}

export function listTargetProfiles(targets?: TargetEntry[]): TargetProfile[] {
  if (!targets || targets.length === 0) {
    return Object.values(DEFAULT_TARGETS);
  }
  return targets.map(resolveTargetEntry);
}

export function getTargetProfile(name: string, targets?: TargetProfile[]): TargetProfile | null {
  if (targets) {
    return targets.find((t) => t.id === name) ?? null;
  }
  return DEFAULT_TARGETS[name] ?? null;
}
