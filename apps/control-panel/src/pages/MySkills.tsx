// My Skills page — main workspace with status cards, skill library, and operations panel.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { BatchActions } from '../components/BatchActions';
import { FilterBar } from '../components/FilterBar';
import { SkillDetail } from '../components/SkillDetail';
import { SKILL_PAGE_SIZE, SkillList } from '../components/SkillList';
import { type FilterOptions, filterSkills } from '../lib/filterSkills';
import type { DiscoverResponse, Skill, StatusResponse, TargetProfile } from '../types';

export function MySkills() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [nonSkillDirs, setNonSkillDirs] = useState<string[]>([]);
  const [targetProfiles, setTargetProfiles] = useState<TargetProfile[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [view, setView] = useState<'status' | 'purpose'>('status');
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [status, disc] = await Promise.all([api.getStatus(), api.discover()]);
      setStatusData(status);
      setSkills(disc.skills);
      setNonSkillDirs(disc.nonSkillDirectories);
      setTargetProfiles(disc.targetProfiles);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    if (searchParams.get('discover') === '1') {
      navigate('/explore', { replace: true });
    }
  }, [loadData, searchParams, navigate]);

  const filtered = filterSkills(skills, filters, lang);

  const appliedCount = skills.filter((s) =>
    (s.agentStates || []).some(
      (a) => a.state === 'managed-linked' || a.state === 'unmanaged-local',
    ),
  ).length;
  const problemCount = skills.filter(
    (s) => s.validationStatus && s.validationStatus !== 'pass',
  ).length;

  const handleToggleSelect = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleTogglePage = (checked: boolean) => {
    const start = page * SKILL_PAGE_SIZE;
    const pageSkills = filtered.slice(start, start + SKILL_PAGE_SIZE);
    setSelectedNames((prev) => {
      const next = new Set(prev);
      for (const s of pageSkills) {
        if (checked) next.add(s.name);
        else next.delete(s.name);
      }
      return next;
    });
  };

  const handleDeselect = () => {
    setSelectedNames(new Set());
    setSelectedSkill(null);
  };

  const handleSelectSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    setSelectedNames(new Set([skill.name]));
  };

  const handleFiltersChange = (f: FilterOptions) => {
    setFilters(f);
    setPage(0);
    setSelectedNames(new Set());
  };

  const handleViewChange = (v: 'status' | 'purpose') => {
    setView(v);
    setSelectedNames(new Set());
  };

  const selectionCount = selectedNames.size;
  const panelSkill =
    selectionCount === 1
      ? skills.find((s) => s.name === [...selectedNames][0]) || selectedSkill
      : selectedSkill;

  return (
    <div className="p-4">
      <div id="status-cards" className="flex gap-2 mb-3 flex-wrap">
        {[
          { value: skills.length, label: t('metricTotal') },
          { value: appliedCount, label: t('metricApplied') },
          { value: problemCount, label: t('metricProblem') },
          { value: nonSkillDirs.length, label: t('metricNonSkill') },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-lg px-4 py-2 min-w-[100px] flex-1 text-center"
          >
            <div className="text-xl font-bold text-gray-900 leading-tight">{card.value}</div>
            <div className="text-xs text-gray-500 leading-tight">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div id="skill-library-card" className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <h2 className="text-base font-semibold">{t('discoverHeading')}</h2>
            <div data-testid="skill-library-header-actions" className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={loadData}
                  disabled={loading}
                  className="px-2.5 py-1 bg-blue-600 text-white border border-blue-700 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {t('scanLocal')}
                </button>
                <button
                  type="button"
                  onClick={() => {}}
                  className="px-2.5 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50"
                >
                  {t('exportButton')}
                </button>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleViewChange('status')}
                  className={`px-2.5 py-1 text-xs rounded border ${view === 'status' ? 'bg-blue-600 text-white border-blue-700' : 'border-gray-300'}`}
                >
                  {t('libraryStatusView')}
                </button>
                <button
                  type="button"
                  onClick={() => handleViewChange('purpose')}
                  className={`px-2.5 py-1 text-xs rounded border ${view === 'purpose' ? 'bg-blue-600 text-white border-blue-700' : 'border-gray-300'}`}
                >
                  {t('libraryPurposeView')}
                </button>
              </div>
            </div>
          </div>

          <div data-testid="skill-library-toolbar">
            <FilterBar
              filters={filters}
              onFiltersChange={handleFiltersChange}
              skills={skills}
              targetProfiles={targetProfiles}
            />
          </div>

          <SkillList
            skills={filtered}
            view={view}
            selectedNames={selectedNames}
            onToggleSelect={handleToggleSelect}
            onTogglePage={handleTogglePage}
            onSelectSkill={handleSelectSkill}
            page={page}
            onPageChange={setPage}
            targetProfiles={targetProfiles}
          />
        </div>

        <div
          id="skill-action-card"
          className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col max-h-[calc(100vh-190px)] min-h-[520px] overflow-hidden"
        >
          <div className="mb-3 pb-2 border-b border-gray-100">
            <h2 className="text-base font-semibold">{t('operationsHeading')}</h2>
          </div>

          {selectionCount === 0 && !panelSkill && (
            <div className="text-sm text-gray-400 text-center py-5">{t('noSelectionHint')}</div>
          )}

          {selectionCount === 1 && panelSkill && (
            <div className="overflow-y-auto flex-1">
              <SkillDetail
                skill={panelSkill}
                targetProfiles={targetProfiles}
                onActionResult={loadData}
              />
            </div>
          )}

          {selectionCount > 1 && (
            <div className="overflow-y-auto flex-1">
              <BatchActions
                selectedNames={[...selectedNames]}
                targetProfiles={targetProfiles}
                onDeselect={handleDeselect}
                onActionResult={loadData}
              />
            </div>
          )}

          <div className="flex gap-2 mt-3 opacity-60 hover:opacity-100">
            <button
              type="button"
              onClick={async () => {
                const d = await api.doctor();
                alert(JSON.stringify(d, null, 2));
              }}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              {t('doctorButton')}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (targetProfiles[0]) {
                  const d = await api.rollback(targetProfiles[0].id);
                  alert(JSON.stringify(d, null, 2));
                }
              }}
              className="px-3 py-1.5 bg-red-600 text-white border border-red-700 rounded text-sm hover:bg-red-700"
            >
              {t('rollbackButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
