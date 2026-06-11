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

  return (
    <div aria-label={label} className="flex flex-wrap gap-1.5">
      {agents.map((agent) => (
        <span
          key={agent}
          className="max-w-[96px] truncate rounded-lg border border-[#ded8d5] bg-[#f8f6f5] px-3 py-1 text-sm text-[#282326]"
          title={agent}
        >
          {agent}
        </span>
      ))}
    </div>
  );
}

function SkillIcon({ status }: { status?: string }) {
  const tone =
    status === 'fail' ? 'bg-[#c74e42]' : status === 'fixable' ? 'bg-[#b88242]' : 'bg-[#965276]';

  return (
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6 text-white"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="M12 3v2m0 14v2m7-9h2M3 12h2m11.95-4.95 1.42-1.42M5.63 18.37l1.42-1.42m0-9.9L5.63 5.63m12.74 12.74-1.42-1.42M9 12a3 3 0 1 1 6 0c0 1.2-.7 1.8-1.5 2.4-.7.5-1.5 1.2-1.5 2.1" />
      </svg>
    </span>
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
  onSelectSkill,
  page,
  onPageChange,
}: SkillListProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const totalPages = Math.ceil(skills.length / SKILL_PAGE_SIZE);
  const start = page * SKILL_PAGE_SIZE;
  const pageSkills = skills.slice(start, start + SKILL_PAGE_SIZE);

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
          <table className="w-full border-collapse text-base">
            <thead>
              <tr className="bg-[#fbf8f6] text-left text-sm font-semibold text-[#3d3639]">
                <th className="whitespace-nowrap px-4 py-4">{t('tableSkill')}</th>
                <th className="whitespace-nowrap px-4 py-4">{t('tableSkillDescription')}</th>
                <th className="whitespace-nowrap px-4 py-4">{t('tableStatus')}</th>
                <th className="whitespace-nowrap px-4 py-4">{t('targetAgentHeading')}</th>
                <th className="whitespace-nowrap px-4 py-4">{t('tableMappingStatus')}</th>
                <th className="whitespace-nowrap px-4 py-4">{t('versionLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {pageSkills.map((s) => {
                const agents = formatAppliedAgents(s);
                const mapping = getMappingStatus(s.mappingSummary);
                const selected = selectedNames.has(s.name);
                const mappingLabel =
                  mapping === 'linked'
                    ? t('mappingStatusLinked')
                    : mapping === 'conflict'
                      ? t('mappingStatusConflict')
                      : mapping === 'partial'
                        ? `${s.mappingSummary?.linked || 0}/${s.mappingSummary?.total || 0}`
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
                    <td className="px-4 py-4">
                      <div className="flex min-w-[180px] items-center gap-3">
                        <SkillIcon status={s.validationStatus} />
                        <span className="font-semibold text-[#1f1a1d]">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[#292427]">
                      <div className="max-h-14 max-w-[320px] overflow-hidden leading-7">
                        {resolveSkillDescription(s, lang) || t('noSkillPurpose')}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-sm font-medium ${getStatusBadgeClass(s.validationStatus || '')}`}
                      >
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {s.validationStatus || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <AppliedAgentsCell
                        agents={agents}
                        label={t('tableAppliedAgentsChip')}
                        noneLabel={t('none')}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-lg border px-3 py-1 text-sm font-medium ${mappingBadgeClass(mapping)}`}
                      >
                        {mappingLabel}
                      </span>
                    </td>
                    <td className="min-w-14 whitespace-nowrap px-4 py-4 text-[#342e31]">
                      {s.version || '-'}
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
