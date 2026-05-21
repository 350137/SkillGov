// Target profile definitions for supported agent platforms — resolves home directories and provides default settings for Claude Code and Codex.
import { homedir } from 'node:os';

export interface TargetSupports {
  skillMd: boolean;
  allowedTools: 'partial' | 'full' | 'none';
  scripts: 'unknown' | 'supported' | 'unsupported';
}

export interface TargetProfile {
  skillDirs: string[];
  linkMode: 'junction' | 'symlink' | 'copy';
  supports: TargetSupports;
}

function expandHome(p: string): string {
  return p.replace(/^~/, homedir().replace(/\\/g, '/'));
}

const DEFAULT_TARGETS: Record<string, TargetProfile> = {
  claude: {
    skillDirs: [expandHome('~/.claude/skills')],
    linkMode: 'junction',
    supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
  },
  codex: {
    skillDirs: [expandHome('~/.codex/skills')],
    linkMode: 'junction',
    supports: { skillMd: true, allowedTools: 'partial', scripts: 'unknown' },
  },
};

export function getTargetProfile(name: string): TargetProfile | null {
  return DEFAULT_TARGETS[name] ?? null;
}
