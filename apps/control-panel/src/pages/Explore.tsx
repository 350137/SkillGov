// Explore page — skill library browsing, filtering, and discover/import functionality.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/controlPanelApi';
import { FilterBar } from '../components/FilterBar';
import { SkillList } from '../components/SkillList';
import { type FilterOptions, filterSkills } from '../lib/filterSkills';
import type { Skill, TargetProfile } from '../types';

export function Explore() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const [skills, setSkills] = useState<Skill[]>([]);
  const [targetProfiles, setTargetProfiles] = useState<TargetProfile[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [view, setView] = useState<'status' | 'purpose'>('status');
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    try {
      const disc = await api.discover();
      setSkills(disc.skills);
      setTargetProfiles(disc.targetProfiles);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscover();
  }, [loadDiscover]);

  const filtered = filterSkills(skills, filters, lang);

  return (
    <div className="p-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
          <h2 className="text-base font-semibold">{t('discoverHeading')}</h2>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setView('status')}
              className={`px-2.5 py-1 text-xs rounded border ${view === 'status' ? 'bg-blue-600 text-white border-blue-700' : 'border-gray-300'}`}
            >
              {t('libraryStatusView')}
            </button>
            <button
              type="button"
              onClick={() => setView('purpose')}
              className={`px-2.5 py-1 text-xs rounded border ${view === 'purpose' ? 'bg-blue-600 text-white border-blue-700' : 'border-gray-300'}`}
            >
              {t('libraryPurposeView')}
            </button>
          </div>
        </div>

        <FilterBar
          filters={filters}
          onFiltersChange={(f) => {
            setFilters(f);
            setPage(0);
          }}
          skills={skills}
          targetProfiles={targetProfiles}
        />

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={loadDiscover}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-600 text-white border border-blue-700 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {t('scanLocal')}
          </button>
        </div>

        <SkillList
          skills={filtered}
          view={view}
          selectedNames={selectedNames}
          onToggleSelect={(name) => {
            setSelectedNames((prev) => {
              const next = new Set(prev);
              if (next.has(name)) next.delete(name);
              else next.add(name);
              return next;
            });
          }}
          onTogglePage={(checked) => {
            const start = page * 20;
            const pageSkills = filtered.slice(start, start + 20);
            setSelectedNames((prev) => {
              const next = new Set(prev);
              for (const s of pageSkills) {
                if (checked) next.add(s.name);
                else next.delete(s.name);
              }
              return next;
            });
          }}
          onSelectSkill={(skill) => setSelectedNames(new Set([skill.name]))}
          page={page}
          onPageChange={setPage}
          targetProfiles={targetProfiles}
        />
      </div>
    </div>
  );
}
