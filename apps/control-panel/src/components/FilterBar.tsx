// Filter bar component — search input and dropdown filters for the skill library.
import { useTranslation } from 'react-i18next';
import type { FilterOptions } from '../lib/filterSkills';
import type { TargetProfile } from '../types';

interface FilterBarProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  targetProfiles: TargetProfile[];
}

export function FilterBar({ filters, onFiltersChange, targetProfiles }: FilterBarProps) {
  const { t } = useTranslation();

  const update = (key: keyof FilterOptions, value: string) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div className="mb-5 flex flex-nowrap items-center gap-3 overflow-x-auto pb-1">
      <label className="relative min-w-[300px] max-w-[360px] flex-1">
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
          className="h-11 w-full rounded border border-[#ded4d0] bg-white px-12 text-sm text-[#282326] shadow-sm placeholder:text-[#7b7276]"
        />
      </label>

      <select
        value={filters.status || ''}
        onChange={(e) => update('status', e.target.value)}
        className="h-11 w-[124px] shrink-0 rounded border border-[#ded4d0] bg-white px-3 text-sm text-[#2c2629] shadow-sm"
      >
        <option value="">{t('allStatuses')}</option>
        <option value="pass">{t('filterStatusPass')}</option>
        <option value="fixable">{t('filterStatusFixable')}</option>
        <option value="fail">{t('filterStatusFail')}</option>
      </select>

      <select
        value={filters.mapping || ''}
        onChange={(e) => update('mapping', e.target.value)}
        className="h-11 w-[136px] shrink-0 rounded border border-[#ded4d0] bg-white px-3 text-sm text-[#2c2629] shadow-sm"
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
        className="h-11 w-[148px] shrink-0 rounded border border-[#ded4d0] bg-white px-3 text-sm text-[#2c2629] shadow-sm"
      >
        <option value="">{t('allAgents')}</option>
        {targetProfiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label || p.id}
          </option>
        ))}
      </select>

      <select
        aria-label={t('defaultSort')}
        defaultValue="default"
        className="h-11 w-[120px] shrink-0 rounded border border-[#ded4d0] bg-white px-3 text-sm font-medium text-[#2c2629] shadow-sm"
      >
        <option value="default">{t('defaultSort')}</option>
      </select>
    </div>
  );
}
