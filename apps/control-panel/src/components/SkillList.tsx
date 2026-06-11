// Skill list component — table with status/purpose view toggle, pagination, and multi-select checkboxes.
import { useTranslation } from 'react-i18next';
import {
  formatAppliedAgents,
  getMappingStatus,
  getStatusBadgeClass,
  resolveSkillDescription,
} from '../lib/filterSkills';
import type { Skill, TargetProfile } from '../types';

export const SKILL_PAGE_SIZE = 15;

interface SkillListProps {
  skills: Skill[];
  view: 'status' | 'purpose';
  selectedNames: Set<string>;
  onToggleSelect: (name: string) => void;
  onTogglePage: (checked: boolean) => void;
  onSelectSkill: (skill: Skill) => void;
  page: number;
  onPageChange: (page: number) => void;
  targetProfiles: TargetProfile[];
}

export function SkillList({
  skills,
  view,
  selectedNames,
  onToggleSelect,
  onTogglePage,
  onSelectSkill,
  page,
  onPageChange,
}: SkillListProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const totalPages = Math.ceil(skills.length / SKILL_PAGE_SIZE);
  const start = page * SKILL_PAGE_SIZE;
  const pageSkills = skills.slice(start, start + SKILL_PAGE_SIZE);
  const allPageSelected =
    pageSkills.length > 0 && pageSkills.every((s) => selectedNames.has(s.name));

  if (skills.length === 0) {
    return <p className="text-gray-500 text-sm py-4">{t('noSkills')}</p>;
  }

  return (
    <div>
      {view === 'purpose' ? (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="py-2 px-3">{t('tableNumber')}</th>
              <th className="py-2 px-3">{t('tableSkill')}</th>
              <th className="py-2 px-3">{t('tableSkillPurpose')}</th>
            </tr>
          </thead>
          <tbody>
            {pageSkills.map((s, i) => (
              <tr
                key={s.name}
                className="hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                onClick={() => onSelectSkill(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectSkill(s);
                }}
                tabIndex={0}
              >
                <td className="py-2 px-3 text-gray-500">{start + i + 1}</td>
                <td className="py-2 px-3 font-medium">{s.name}</td>
                <td className="py-2 px-3 text-gray-600 max-w-[760px] whitespace-normal break-words">
                  {resolveSkillDescription(s, lang) || t('noSkillPurpose')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="py-2 px-2 w-8 text-center">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => onTogglePage(e.target.checked)}
                  title={t('selectAll')}
                />
              </th>
              <th className="py-2 px-3">{t('tableNumber')}</th>
              <th className="py-2 px-3">{t('tableSkill')}</th>
              <th className="py-2 px-3">{t('tableStatus')}</th>
              <th className="py-2 px-3">{t('tableAppliedAgentsChip')}</th>
              <th className="py-2 px-3">{t('tableMappingStatus')}</th>
              <th className="py-2 px-3">{t('tableSourceLabel')}</th>
              <th className="py-2 px-3">{t('tablePathLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {pageSkills.map((s, i) => {
              const agents = formatAppliedAgents(s);
              const mapping = getMappingStatus(s.mappingSummary);
              return (
                <tr
                  key={s.name}
                  className="hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                  onClick={() => onSelectSkill(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelectSkill(s);
                  }}
                  tabIndex={0}
                >
                  <td
                    className="py-2 px-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedNames.has(s.name)}
                      onChange={(e) => onToggleSelect(s.name)}
                    />
                  </td>
                  <td className="py-2 px-3 text-gray-500">{start + i + 1}</td>
                  <td className="py-2 px-3 font-medium">{s.name}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(s.validationStatus || '')}`}
                    >
                      {s.validationStatus || '-'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {agents.length > 0 ? (
                      agents.map((a) => (
                        <span
                          key={a}
                          className="inline-block px-1.5 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 mr-1"
                        >
                          {a}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400">{t('none')}</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        mapping === 'linked'
                          ? 'bg-green-100 text-green-800'
                          : mapping === 'conflict'
                            ? 'bg-red-100 text-red-800'
                            : mapping === 'partial'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {mapping === 'linked'
                        ? `${s.mappingSummary?.linked}/${s.mappingSummary?.total}`
                        : mapping === 'conflict'
                          ? t('mappingStatusConflict')
                          : mapping === 'partial'
                            ? `${s.mappingSummary?.linked}/${s.mappingSummary?.total}`
                            : t('mappingStatusUnmapped')}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-500">{s.sourceLabel || s.source || '-'}</td>
                  <td
                    className="py-2 px-3 text-gray-500 max-w-[180px] overflow-hidden text-overflow-ellipsis whitespace-nowrap"
                    title={s.path}
                  >
                    {s.path || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="flex gap-2 items-center mt-2 text-sm">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
        >
          {t('prevPage')}
        </button>
        <span>{t('pageInfo', { current: page + 1, total: totalPages || 1 })}</span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
        >
          {t('nextPage')}
        </button>
        <span className="ml-3 text-gray-500">{t('pageInfoTotal', { total: skills.length })}</span>
      </div>
    </div>
  );
}
