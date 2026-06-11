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
import type { Skill, TargetProfile } from '../types';

type MetricTone = 'plum' | 'green' | 'red' | 'gray';

const metricStyles: Record<MetricTone, { icon: string; value: string; path: string }> = {
  plum: {
    icon: 'bg-[#965276] text-white',
    value: 'text-[#965276]',
    path: 'M7 6.5c0-1.38 2.24-2.5 5-2.5s5 1.12 5 2.5v11c0 1.38-2.24 2.5-5 2.5s-5-1.12-5-2.5v-11Zm0 0c0 1.38 2.24 2.5 5 2.5s5-1.12 5-2.5M7 12c0 1.38 2.24 2.5 5 2.5s5-1.12 5-2.5',
  },
  green: {
    icon: 'bg-[#647f5f] text-white',
    value: 'text-[#647f5f]',
    path: 'M20 6 9 17l-5-5',
  },
  red: {
    icon: 'bg-[#c74e42] text-white',
    value: 'text-[#c74e42]',
    path: 'M12 4 21 20H3L12 4Zm0 5v5m0 3h.01',
  },
  gray: {
    icon: 'bg-[#817b78] text-white',
    value: 'text-[#6f6968]',
    path: 'M4 7.5h6l2 2h8v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5Z',
  },
};

interface MetricCardProps {
  label: string;
  value: number;
  tone: MetricTone;
}

function MetricCard({ label, value, tone }: MetricCardProps) {
  const style = metricStyles[tone];

  return (
    <div className="flex min-h-[116px] items-center gap-5 rounded-lg border border-[#e6deda] bg-white/82 px-6 py-5 shadow-[0_18px_50px_rgba(80,55,45,0.06)]">
      <div
        className={`flex h-[64px] w-[64px] items-center justify-center rounded-full ${style.icon} shadow-inner`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d={style.path} />
        </svg>
      </div>
      <div>
        <div className="text-base font-semibold text-[#2b2528]">{label}</div>
        <div className={`mt-2 text-4xl font-semibold leading-none ${style.value}`}>{value}</div>
      </div>
    </div>
  );
}

export function MySkills() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

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
      const disc = await api.discover();
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

  useEffect(() => {
    if (filtered.length === 0) return;
    if (
      selectedNames.size > 0 &&
      [...selectedNames].every((name) => filtered.some((s) => s.name === name))
    ) {
      return;
    }
    setSelectedSkill(filtered[0]);
    setSelectedNames(new Set([filtered[0].name]));
  }, [filtered, selectedNames]);

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
    <div className="p-6">
      <div
        id="status-cards"
        data-testid="dashboard-metrics"
        className="grid max-w-[1280px] gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard label={t('metricTotal')} value={skills.length} tone="plum" />
        <MetricCard label={t('metricApplied')} value={appliedCount} tone="green" />
        <MetricCard label={t('metricProblem')} value={problemCount} tone="red" />
        <MetricCard label={t('metricNonSkill')} value={nonSkillDirs.length} tone="gray" />
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div
          id="skill-library-card"
          className="rounded-lg border border-[#e6deda] bg-white/86 p-6 shadow-[0_22px_60px_rgba(80,55,45,0.06)]"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-normal text-[#201b1e]">
              {t('discoverHeading')}
            </h2>
            <div
              data-testid="skill-library-header-actions"
              className="flex flex-wrap items-center gap-2"
            >
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="rounded bg-[#965276] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#854669] disabled:opacity-50"
              >
                {t('scanLocal')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/explore')}
                className="flex items-center gap-2 rounded bg-[#965276] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#854669]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
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
              <button
                type="button"
                onClick={() => alert(t('exportNotImplemented'))}
                className="rounded border border-[#d9cfca] bg-white px-3 py-2 text-sm font-medium text-[#5c5357] transition hover:bg-[#f8f3f1]"
              >
                {t('exportButton')}
              </button>
              <button
                type="button"
                onClick={() => handleViewChange('status')}
                className={`rounded px-3 py-2 text-sm font-semibold transition ${
                  view === 'status'
                    ? 'bg-[#965276] text-white'
                    : 'border border-[#d9cfca] bg-white text-[#5c5357] hover:bg-[#f8f3f1]'
                }`}
              >
                {t('libraryStatusView')}
              </button>
              <button
                type="button"
                onClick={() => handleViewChange('purpose')}
                className={`rounded px-3 py-2 text-sm font-semibold transition ${
                  view === 'purpose'
                    ? 'bg-[#965276] text-white'
                    : 'border border-[#d9cfca] bg-white text-[#5c5357] hover:bg-[#f8f3f1]'
                }`}
              >
                {t('libraryPurposeView')}
              </button>
            </div>
          </div>

          <div data-testid="skill-library-toolbar">
            <FilterBar
              filters={filters}
              onFiltersChange={handleFiltersChange}
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
          className="flex min-h-[620px] max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-lg border border-[#e6deda] bg-white/88 shadow-[0_22px_60px_rgba(80,55,45,0.06)]"
        >
          <div className="border-b border-[#eadfdd] px-6 py-5">
            <h2 className="text-2xl font-semibold text-[#201b1e]">{t('operationsHeading')}</h2>
          </div>

          {selectionCount === 0 && !panelSkill && (
            <div className="px-6 py-8 text-center text-sm text-[#8c8387]">
              {t('noSelectionHint')}
            </div>
          )}

          {selectionCount === 1 && panelSkill && (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <SkillDetail
                skill={panelSkill}
                targetProfiles={targetProfiles}
                onActionResult={loadData}
              />
            </div>
          )}

          {selectionCount > 1 && (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <BatchActions
                selectedNames={[...selectedNames]}
                targetProfiles={targetProfiles}
                onDeselect={handleDeselect}
                onActionResult={loadData}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
