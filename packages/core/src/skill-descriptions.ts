// Bilingual skill description registry helpers for SkillGov-managed skill purpose text.
import { readRegistry, writeRegistry } from './registry.js';

export type SkillDescriptionLanguage = 'zh' | 'en';

export type SkillDescriptionSource = 'frontmatter' | 'manual' | 'machine' | 'imported';

export type SkillDescriptionReviewStatus = 'missing' | 'machine' | 'manual' | 'reviewed';

export interface SkillDescriptionEntry {
  zh?: string;
  en?: string;
  source: SkillDescriptionSource;
  reviewStatus: SkillDescriptionReviewStatus;
  updatedAt?: string;
}

export interface SkillDescriptionsRegistry {
  version: 1;
  descriptions: Record<string, SkillDescriptionEntry>;
}

export function emptySkillDescriptionsRegistry(): SkillDescriptionsRegistry {
  return { version: 1, descriptions: {} };
}

export function readSkillDescriptions(registryPath: string): SkillDescriptionsRegistry {
  return readRegistry<SkillDescriptionsRegistry>(registryPath, emptySkillDescriptionsRegistry());
}

export function writeSkillDescriptions(
  registryPath: string,
  registry: SkillDescriptionsRegistry,
): void {
  writeRegistry(registryPath, registry);
}

export function upsertSkillDescription(
  registryPath: string,
  skillName: string,
  patch: Partial<SkillDescriptionEntry>,
): SkillDescriptionEntry {
  const registry = readSkillDescriptions(registryPath);
  const existing = registry.descriptions[skillName] || {
    source: 'manual',
    reviewStatus: 'missing',
  };

  const next: SkillDescriptionEntry = {
    ...existing,
    ...patch,
    source: patch.source || existing.source,
    reviewStatus: patch.reviewStatus || existing.reviewStatus,
    updatedAt: patch.updatedAt || existing.updatedAt || new Date().toISOString(),
  };

  registry.descriptions[skillName] = next;
  writeSkillDescriptions(registryPath, registry);
  return next;
}

export function resolveSkillDescription(
  entry: SkillDescriptionEntry | undefined,
  language: SkillDescriptionLanguage,
  fallbackDescription = '',
): string {
  if (!entry) return fallbackDescription;
  const primary = entry[language];
  if (primary) return primary;
  const secondary = language === 'zh' ? entry.en : entry.zh;
  if (secondary) return secondary;
  return fallbackDescription;
}

export function detectDescriptionLanguage(text: string): SkillDescriptionLanguage {
  const trimmed = text.trim();
  if (!trimmed) return 'en';
  const chineseCharacters = trimmed.match(/[\u3400-\u9fff]/g)?.length || 0;
  return chineseCharacters / trimmed.length > 0.2 ? 'zh' : 'en';
}
