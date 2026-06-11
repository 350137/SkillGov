// Filter bar component — search input and dropdown filters for the skill library.
import { useTranslation } from 'react-i18next';
import { type FilterOptions, extractSources } from '../lib/filterSkills';
import type { TargetProfile } from '../types';
import type { Skill } from '../types';

interface FilterBarProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  skills: Skill[];
  targetProfiles: TargetProfile[];
  onAddSkill: () => void;
}

export function FilterBar({
  filters,
  onFiltersChange,
  skills,
  targetProfiles,
  onAddSkill,
}: FilterBarProps) {
  const { t } = useTranslation();
  const sources = extractSources(skills);

  const update = (key: keyof FilterOptions, value: string) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <label className="relative min-w-[280px] flex-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5f575b]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          >
            <path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" />
          </svg>
        </span>
        <input
          type="text"
          placeholder={t('skillSearchPlaceholder')}
          value={filters.search || ''}
          onChange={(e) => update('search', e.target.value)}
          className="h-12 w-full rounded border border-[#ded4d0] bg-white px-12 text-base text-[#282326] shadow-sm placeholder:text-[#7b7276]"
        />
      </label>

      <details className="group relative">
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 rounded border border-[#ded4d0] bg-white px-5 text-base font-medium text-[#2c2629] shadow-sm transition hover:bg-[#faf6f4]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          >
            <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
          </svg>
          <span>{t('filterButton')}</span>
        </summary>
        <div className="absolute right-0 z-20 mt-2 grid w-[280px] gap-3 rounded-lg border border-[#ded4d0] bg-white p-4 shadow-[0_20px_50px_rgba(54,38,31,0.16)]">
          <select
            value={filters.status || ''}
            onChange={(e) => update('status', e.target.value)}
            className="h-10 rounded border border-[#ded4d0] bg-white px-3 text-sm"
          >
            <option value="">{t('allStatuses')}</option>
            <option value="pass">{t('filterStatusPass')}</option>
            <option value="fixable">{t('filterStatusFixable')}</option>
            <option value="fail">{t('filterStatusFail')}</option>
          </select>
          <select
            value={filters.source || ''}
            onChange={(e) => update('source', e.target.value)}
            className="h-10 rounded border border-[#ded4d0] bg-white px-3 text-sm"
          >
            <option value="">{t('allSources')}</option>
            {sources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
          <select
            value={filters.mapping || ''}
            onChange={(e) => update('mapping', e.target.value)}
            className="h-10 rounded border border-[#ded4d0] bg-white px-3 text-sm"
          >
            <option value="">{t('allMappings')}</option>
            <option value="linked">{t('filterMappingLinked')}</option>
            <option value="missing">{t('filterMappingMissing')}</option>
            <option value="conflict">{t('filterMappingConflict')}</option>
            <option value="unmapped">{t('filterMappingUnmapped')}</option>
          </select>
          <select
            value={filters.agent || ''}
            onChange={(e) => update('agent', e.target.value)}
            className="h-10 rounded border border-[#ded4d0] bg-white px-3 text-sm"
          >
            <option value="">{t('allAgents')}</option>
            {targetProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label || p.id}
              </option>
            ))}
          </select>
        </div>
      </details>

      <select
        aria-label={t('defaultSort')}
        defaultValue="default"
        className="h-12 rounded border border-[#ded4d0] bg-white px-5 text-base font-medium text-[#2c2629] shadow-sm"
      >
        <option value="default">{t('defaultSort')}</option>
      </select>

      <button
        type="button"
        onClick={onAddSkill}
        className="flex h-12 items-center gap-2 rounded bg-[#965276] px-5 text-base font-semibold text-white shadow-sm transition hover:bg-[#854669]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>{t('addSkillButton')}</span>
      </button>
    </div>
  );
}
