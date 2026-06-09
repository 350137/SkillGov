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
}

export function FilterBar({ filters, onFiltersChange, skills, targetProfiles }: FilterBarProps) {
  const { t } = useTranslation();
  const sources = extractSources(skills);

  const update = (key: keyof FilterOptions, value: string) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div className="flex flex-wrap gap-2 items-center mb-3">
      <input
        type="text"
        placeholder={t('skillSearchPlaceholder')}
        value={filters.search || ''}
        onChange={(e) => update('search', e.target.value)}
        className="px-2.5 py-1.5 border border-gray-300 rounded text-sm flex-1 min-w-[140px]"
      />
      <select
        value={filters.status || ''}
        onChange={(e) => update('status', e.target.value)}
        className="px-2 py-1.5 border border-gray-300 rounded bg-white text-sm"
      >
        <option value="">{t('allStatuses')}</option>
        <option value="pass">{t('filterStatusPass')}</option>
        <option value="fixable">{t('filterStatusFixable')}</option>
        <option value="fail">{t('filterStatusFail')}</option>
      </select>
      <select
        value={filters.source || ''}
        onChange={(e) => update('source', e.target.value)}
        className="px-2 py-1.5 border border-gray-300 rounded bg-white text-sm"
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
        className="px-2 py-1.5 border border-gray-300 rounded bg-white text-sm"
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
        className="px-2 py-1.5 border border-gray-300 rounded bg-white text-sm"
      >
        <option value="">{t('allAgents')}</option>
        {targetProfiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label || p.id}
          </option>
        ))}
      </select>
    </div>
  );
}
