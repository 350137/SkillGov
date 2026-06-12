// Skill list component: table view with status badges, target-agent chips, and pagination.
import { useTranslation } from 'react-i18next';
import {
  formatAppliedAgents,
  getMappingStatus,
  getStatusBadgeClass,
  resolveSkillDescription,
} from '../lib/filterSkills';
import type { Skill, TargetProfile } from '../types';

export const SKILL_PAGE_SIZE = 15;

interface AppliedAgentsCellProps {
  agents: string[];
  label: string;
  noneLabel: string;
}

function AppliedAgentsCell({ agents, label, noneLabel }: AppliedAgentsCellProps) {
  if (agents.length === 0) {
    return <span className="text-[#9a9295]">{noneLabel}</span>;
  }

  if (agents.length === 1) {
    return (
      <span className="inline-block max-w-[120px] truncate rounded bg-[#eef2ff] px-2 py-1 text-sm text-[#2f35d5]">
        {agents[0]}
      </span>
    );
  }

  return (
    <select
      aria-label={label}
      defaultValue={agents[0]}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className="h-9 max-w-[130px] rounded border border-[#d3d9e1] bg-white px-2 text-sm"
    >
      {agents.map((agent) => (
        <option key={agent} value={agent}>
          {agent}
        </option>
      ))}
    </select>
  );
}

function mappingBadgeClass(mapping: ReturnType<typeof getMappingStatus>) {
  if (mapping === 'linked') return 'bg-[#e9f3e5] text-[#245b30] border-[#d5e7ce]';
  if (mapping === 'conflict') return 'bg-[#fdecea] text-[#b92e24] border-[#f3d3cf]';
  if (mapping === 'partial') return 'bg-[#fff6df] text-[#9a6300] border-[#f1dfb3]';
  return 'bg-[#f2efee] text-[#6f6968] border-[#e0d8d4]';
}

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
    return <p className="py-8 text-center text-sm text-[#8c8387]">{t('noSkills')}</p>;
  }

  return (
    <div>
      {view === 'purpose' ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#fbf8f6] text-left text-sm font-semibold text-[#3d3639]">
              <th className="px-3 py-2">{t('tableNumber')}</th>
              <th className="px-3 py-2">{t('tableSkill')}</th>
              <th className="px-3 py-2">{t('tableSkillPurpose')}</th>
            </tr>
          </thead>
          <tbody>
            {pageSkills.map((s, i) => (
              <tr
                key={s.name}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                onClick={() => onSelectSkill(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectSkill(s);
                }}
                tabIndex={0}
              >
                <td className="px-3 py-2 text-gray-500">{start + i + 1}</td>
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="max-w-[760px] whitespace-normal break-words px-3 py-2 text-gray-600">
                  {resolveSkillDescription(s, lang) || t('noSkillPurpose')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#e6deda]">
          <table className="w-full table-fixed border-collapse text-base">
            <thead>
              <tr className="bg-[#fbf8f6] text-left text-sm font-semibold text-[#3d3639]">
                <th className="w-12 px-4 py-4 text-center">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => onTogglePage(e.target.checked)}
                    title={t('selectAll')}
                    className="h-4 w-4"
                  />
                </th>
                <th className="w-16 whitespace-nowrap px-4 py-4">{t('tableNumber')}</th>
                <th className="w-[210px] whitespace-nowrap px-4 py-4">{t('tableSkill')}</th>
                <th className="w-[104px] whitespace-nowrap px-4 py-4">{t('tableStatus')}</th>
                <th className="w-[150px] whitespace-nowrap px-4 py-4">{t('tableAgent')}</th>
                <th className="w-[122px] whitespace-nowrap px-4 py-4">{t('tableMappingStatus')}</th>
                <th className="whitespace-nowrap px-4 py-4">{t('tablePathLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {pageSkills.map((s, i) => {
                const agents = formatAppliedAgents(s);
                const mapping = getMappingStatus(s.mappingSummary);
                const selected = selectedNames.has(s.name);
                const mappingLabel =
                  mapping === 'linked' || mapping === 'partial'
                    ? `${s.mappingSummary?.linked || 0}/${s.mappingSummary?.total || 0}`
                    : mapping === 'conflict'
                      ? t('mappingStatusConflict')
                      : t('mappingStatusUnmapped');

                return (
                  <tr
                    key={s.name}
                    className={`cursor-pointer border-t border-[#eee5e1] transition ${
                      selected ? 'bg-[#fbf4f7]' : 'bg-white hover:bg-[#fbf8f6]'
                    }`}
                    onClick={() => onSelectSkill(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onSelectSkill(s);
                    }}
                    tabIndex={0}
                  >
                    <td
                      className="px-4 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedNames.has(s.name)}
                        onChange={() => onToggleSelect(s.name)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#637083]">{start + i + 1}</td>
                    <td className="px-4 py-3">
                      <span
                        data-testid="skill-name-cell"
                        className="block truncate font-semibold text-[#1f1a1d]"
                        title={s.name}
                      >
                        {s.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${getStatusBadgeClass(s.validationStatus || '')}`}
                      >
                        {s.validationStatus || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <AppliedAgentsCell
                        agents={agents}
                        label={t('tableAppliedAgentsChip')}
                        noneLabel={t('none')}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${mappingBadgeClass(mapping)}`}
                      >
                        {mappingLabel}
                      </span>
                    </td>
                    <td
                      className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-[#4d5a70]"
                      title={s.path}
                    >
                      {s.path || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 text-base">
        <span className="mr-auto text-[#3a3336]">
          {t('pageInfoTotal', { total: skills.length })}
        </span>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(0)}
          className="rounded border border-[#e2d8d4] px-5 py-3 text-[#8a8084] transition hover:bg-[#fbf8f6] disabled:opacity-45"
        >
          {t('firstPage')}
        </button>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className="rounded border border-[#e2d8d4] px-5 py-3 text-[#8a8084] transition hover:bg-[#fbf8f6] disabled:opacity-45"
        >
          {t('prevPage')}
        </button>
        <span className="rounded border border-[#965276] px-5 py-3 font-semibold text-[#965276]">
          {page + 1}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="rounded border border-[#e2d8d4] px-5 py-3 text-[#8a8084] transition hover:bg-[#fbf8f6] disabled:opacity-45"
        >
          {t('nextPage')}
        </button>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(Math.max(totalPages - 1, 0))}
          className="rounded border border-[#e2d8d4] px-5 py-3 text-[#8a8084] transition hover:bg-[#fbf8f6] disabled:opacity-45"
        >
          {t('lastPage')}
        </button>
      </div>
    </div>
  );
}
