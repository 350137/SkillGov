// Target profile definitions for supported agent platforms — resolves home directories and provides default settings for Claude Code and Codex.
import { homedir } from 'node:os';

export interface TargetSupports {
  skillMd: boolean;
  allowedTools: 'partial' | 'full' | 'none';
  scripts: 'unknown' | 'supported' | 'unsupported';
  agents?: CapabilitySupport;
  mcp?: CapabilitySupport;
  hooks?: CapabilitySupport;
  dynamicShell?: CapabilitySupport;
  skillPermissions?: CapabilitySupport;
  modelSelection?: CapabilitySupport;
}

export type CapabilitySupport = 'native' | 'mapped' | 'none' | 'unknown';

export interface TargetProfile {
  id: string;
  label: string;
  skillDirs: string[];
  linkMode: 'junction' | 'symlink' | 'copy';
  supports: TargetSupports;
}

export type TargetEntry =
  | string
  | {
      id: string;
      label: string;
      skillDirs: string[];
      linkMode?: TargetProfile['linkMode'];
      supports?: Partial<TargetSupports>;
    };

function expandHome(p: string): string {
  return p.replace(/^~/, homedir().replace(/\\/g, '/'));
}

const GENERIC_TARGET_SUPPORTS: TargetSupports = {
  skillMd: true,
  allowedTools: 'partial',
  scripts: 'unknown',
  agents: 'native',
  mcp: 'unknown',
  hooks: 'unknown',
  dynamicShell: 'unknown',
  skillPermissions: 'unknown',
  modelSelection: 'unknown',
};

function mergeSupports(overrides: Partial<TargetSupports> = {}): TargetSupports {
  return { ...GENERIC_TARGET_SUPPORTS, ...overrides };
}

const DEFAULT_TARGETS: Record<string, TargetProfile> = {
  claude: {
    id: 'claude',
    label: 'Claude',
    skillDirs: [expandHome('~/.claude/skills')],
    linkMode: 'junction',
    supports: mergeSupports({
      allowedTools: 'full',
      scripts: 'unknown',
      agents: 'native',
      mcp: 'native',
      hooks: 'native',
      dynamicShell: 'native',
      skillPermissions: 'native',
      modelSelection: 'native',
    }),
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    skillDirs: [expandHome('~/.codex/skills')],
    linkMode: 'junction',
    supports: mergeSupports({
      allowedTools: 'partial',
      scripts: 'unknown',
      agents: 'native',
      mcp: 'native',
      hooks: 'none',
      dynamicShell: 'unknown',
      skillPermissions: 'unknown',
      modelSelection: 'unknown',
    }),
  },
};

function resolveTargetEntry(entry: TargetEntry): TargetProfile {
  if (typeof entry === 'string') {
    return (
      DEFAULT_TARGETS[entry] ?? {
        id: entry,
        label: entry,
        skillDirs: [],
        linkMode: 'junction',
        supports: mergeSupports({
          skillMd: false,
          allowedTools: 'none',
          agents: 'unknown',
          mcp: 'unknown',
          hooks: 'unknown',
          dynamicShell: 'unknown',
          skillPermissions: 'unknown',
          modelSelection: 'unknown',
        }),
      }
    );
  }
  return {
    id: entry.id,
    label: entry.label,
    skillDirs: entry.skillDirs,
    linkMode: entry.linkMode || 'junction',
    supports: mergeSupports(entry.supports),
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
