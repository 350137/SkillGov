// Skill filtering logic migrated from client-script.ts — search, status, source, mapping, and agent filters.
import type { Skill } from '../types';

export interface FilterOptions {
  search?: string;
  status?: string;
  source?: string;
  mapping?: string;
  agent?: string;
}

export function resolveSkillDescription(skill: Skill, language = 'en'): string {
  const d = skill.displayDescription || {};
  if (language === 'zh') return d.zh || d.en || d.fallback || '';
  return d.en || d.zh || d.fallback || '';
}

export function filterSkills(skills: Skill[], opts: FilterOptions, language = 'en'): Skill[] {
  let result = skills || [];
  if (opts.search) {
    const q = opts.search.toLowerCase();
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.path || '').toLowerCase().includes(q) ||
        (s.sourceLabel || s.source || '').toLowerCase().includes(q) ||
        resolveSkillDescription(s, language).toLowerCase().includes(q) ||
        (s.agentStates || []).some((a) =>
          (a.profileLabel || a.profileId).toLowerCase().includes(q),
        ),
    );
  }
  if (opts.status) {
    result = result.filter((s) => s.validationStatus === opts.status);
  }
  if (opts.source) {
    result = result.filter((s) => (s.sourceLabel || s.source) === opts.source);
  }
  if (opts.mapping) {
    result = result.filter((s) => {
      const ms = s.mappingSummary;
      if (opts.mapping === 'unmapped') return !ms || ms.total === 0;
      if (opts.mapping === 'linked')
        return ms && ms.linked > 0 && ms.missing === 0 && ms.conflict === 0;
      if (opts.mapping === 'missing') return ms && ms.missing > 0;
      if (opts.mapping === 'conflict') return ms && ms.conflict > 0;
      return true;
    });
  }
  if (opts.agent) {
    result = result.filter((s) => (s.agentStates || []).some((a) => a.profileId === opts.agent));
  }
  return result;
}

export function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    compatible: 'bg-green-100 text-green-800',
    'needs-mapping': 'bg-yellow-100 text-yellow-800',
    'needs-overlay': 'bg-yellow-100 text-yellow-800',
    unsupported: 'bg-red-100 text-red-800',
    mapped: 'bg-green-100 text-green-800',
    'already-mapped': 'bg-green-100 text-green-800',
    unmapped: 'bg-gray-100 text-gray-600',
    adopted: 'bg-green-100 text-green-800',
    'already-linked': 'bg-green-100 text-green-800',
    'not-found': 'bg-yellow-100 text-yellow-800',
    pass: 'bg-green-100 text-green-800',
    fixable: 'bg-yellow-100 text-yellow-800',
    fail: 'bg-red-100 text-red-800',
    error: 'bg-red-100 text-red-800',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
}

export function formatAppliedAgents(skill: Skill): string[] {
  return (skill.agentStates || [])
    .filter((s) => s.state === 'managed-linked' || s.state === 'unmanaged-local')
    .map((a) => a.profileLabel || a.profileId);
}

export function getMappingStatus(
  summary: Skill['mappingSummary'],
): 'linked' | 'conflict' | 'partial' | 'unmapped' {
  if (!summary || summary.total === 0) return 'unmapped';
  if (summary.conflict > 0) return 'conflict';
  if (summary.missing > 0) return 'partial';
  return 'linked';
}

export function extractSources(skills: Skill[]): string[] {
  const sources = new Set<string>();
  for (const s of skills) {
    const src = s.sourceLabel || s.source;
    if (src) sources.add(src);
  }
  return [...sources].sort();
}
