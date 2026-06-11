// Skill detail component; displays selected skill info, compatibility checks, and single-skill operations.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import {
  formatAppliedAgents,
  getMappingStatus,
  getStatusBadgeClass,
  resolveSkillDescription,
} from '../lib/filterSkills';
import type { CompatResult, Skill, TargetProfile } from '../types';
import { ToolSelector } from './ToolSelector';

interface SkillDetailProps {
  skill: Skill;
  targetProfiles: TargetProfile[];
  onActionResult: () => void;
}

export function SkillDetail({ skill, targetProfiles, onActionResult }: SkillDetailProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const [target, setTarget] = useState(targetProfiles[0]?.id || '');
  const [compatResult, setCompatResult] = useState<CompatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; message?: string } | null>(null);

  const agents = formatAppliedAgents(skill);
  const description = resolveSkillDescription(skill, lang);
  const descriptionReviewStatus = skill.displayDescription?.reviewStatus;
  const descriptionSource = skill.displayDescription?.source;
  const mapping = getMappingStatus(skill.mappingSummary);
  const mappingLabel =
    mapping === 'linked'
      ? t('mappingStatusLinked')
      : mapping === 'conflict'
        ? t('mappingStatusConflict')
        : mapping === 'partial'
          ? `${skill.mappingSummary?.linked || 0}/${skill.mappingSummary?.total || 0}`
          : t('mappingStatusUnmapped');
  const hasBlockingWarning =
    ((skill.validationStatus || '') !== '' && skill.validationStatus !== 'pass') ||
    mapping === 'conflict';
  const tags = Array.from(new Set(skill.name.split(/[-_]/).filter(Boolean).slice(0, 4)));

  const handleCompat = async () => {
    if (!skill.path || !target) return;
    setLoading(true);
    try {
      const data = await api.compat(skill.path, target);
      setCompatResult(data);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'map' | 'unmap' | 'adopt') => {
    if (!target) return;
    setLoading(true);
    try {
      const data = await api[action](skill.name, target);
      setResult(data);
      onActionResult();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-base font-semibold text-[#211c1f]">
        {t('selectedSkillLabel')}: <span className="text-[#965276]">{skill.name}</span>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-medium text-[#5b5357]">{t('targetAgentHeading')}</h3>
        <ToolSelector targetProfiles={targetProfiles} value={target} onChange={setTarget} />
      </div>

      <div className="mt-5 space-y-5 text-base text-[#2b2528]">
        <div>
          <div className="mb-2 text-sm font-medium text-[#5b5357]">
            {t('validationStatusLabel')}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-sm font-medium ${getStatusBadgeClass(skill.validationStatus || '')}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {skill.validationStatus || '-'}
          </span>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium text-[#5b5357]">{t('versionLabel')}</div>
          <div>{skill.version || '-'}</div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-[#5b5357]">{t('mappingHeading')}</div>
          <span className="inline-flex rounded-lg border border-[#d5e7ce] bg-[#e9f3e5] px-3 py-1 text-sm font-medium text-[#245b30]">
            {mappingLabel}
          </span>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-[#5b5357]">{t('tagsHeading')}</div>
          <div className="flex flex-wrap gap-2">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-lg border border-[#ded8d5] bg-[#f8f6f5] px-3 py-1 text-sm text-[#4b4448]"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-[#8c8387]">{t('none')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <button
          type="button"
          onClick={() => handleAction('map')}
          disabled={loading}
          className="flex h-12 items-center justify-center gap-2 rounded bg-[#965276] px-4 text-base font-semibold text-white shadow-sm transition hover:bg-[#854669] disabled:opacity-50"
        >
          <span aria-hidden="true">▷</span>
          {t('applySkillButton')}
        </button>
        <button
          type="button"
          onClick={handleCompat}
          disabled={loading}
          className="flex h-12 items-center justify-center gap-2 rounded bg-[#f1e9e7] px-4 text-base font-semibold text-[#8d4b6d] transition hover:bg-[#eadfdd] disabled:opacity-50"
        >
          <span aria-hidden="true">↗</span>
          {t('viewDetailsButton')}
        </button>
        <button
          type="button"
          onClick={() => handleAction('unmap')}
          disabled={loading}
          className="flex h-12 items-center justify-center gap-2 rounded border border-[#e26057] bg-white px-4 text-base font-semibold text-[#be2f28] transition hover:bg-[#fff4f2] disabled:opacity-50"
        >
          <span aria-hidden="true">⌫</span>
          {t('disableDeleteButton')}
        </button>
      </div>

      {hasBlockingWarning && (
        <div className="mt-5 rounded-lg border border-[#f0c9c2] bg-[#fff3f0] px-4 py-4 text-[#7b2a24]">
          <div className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true">!</span>
            <span>{t('blockingWarningDetected', { count: 1 })}:</span>
          </div>
          <div className="mt-2 pl-6 text-sm text-[#3b2b2a]">{t('metadataWarning')}</div>
        </div>
      )}

      <section className="mt-6 border-t border-[#eadfdd] pt-5">
        <h3 className="mb-2 text-sm font-semibold text-[#5b5357]">{t('skillIntroHeading')}</h3>
        <p className="whitespace-normal break-words text-sm leading-6 text-[#342e31]">
          {description || t('noSkillPurpose')}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
          <div>
            <span className="block text-[#6f676b]">{t('tableSourceLabel')}</span>
            <span className="font-medium text-[#342e31]">
              {skill.sourceLabel || skill.source || '-'}
            </span>
          </div>
          {descriptionReviewStatus && (
            <div>
              <span className="block text-[#6f676b]">{t('descriptionReviewStatus')}</span>
              <span className="font-medium text-[#342e31]">{descriptionReviewStatus}</span>
            </div>
          )}
          {descriptionSource && (
            <div>
              <span className="block text-[#6f676b]">{t('descriptionSource')}</span>
              <span className="font-medium text-[#342e31]">{descriptionSource}</span>
            </div>
          )}
          {agents.length > 0 && (
            <div>
              <span className="block text-[#6f676b]">{t('tableAppliedAgentsChip')}</span>
              <span className="font-medium text-[#342e31]">{agents.join(' / ')}</span>
            </div>
          )}
        </div>
      </section>

      {compatResult && (
        <div className="mt-4 rounded-lg border border-[#e6deda] bg-[#fbf8f6] p-3">
          <span
            className={`inline-flex rounded-lg px-3 py-1 text-sm font-semibold ${getStatusBadgeClass(compatResult.status)}`}
          >
            {compatResult.status}
          </span>
          {compatResult.reason && (
            <p className="mt-2 text-sm text-[#5c5357]">{compatResult.reason}</p>
          )}
          {compatResult.suggestedAction && (
            <p className="mt-2 text-sm text-[#6f676b]">
              <strong>{t('checkButton')}:</strong> {compatResult.suggestedAction}
            </p>
          )}
          {compatResult.issues && compatResult.issues.length > 0 && (
            <ul className="mt-2">
              {compatResult.issues.map((issue) => (
                <li key={issue.message} className="py-0.5 text-sm">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs ${getStatusBadgeClass(issue.severity === 'error' ? 'fail' : issue.severity === 'warning' ? 'fixable' : 'pass')}`}
                  >
                    {issue.severity}
                  </span>{' '}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          {compatResult.status === 'compatible' &&
            (!compatResult.issues || compatResult.issues.length === 0) && (
              <p className="mt-2 text-sm text-[#6f676b]">{t('compatNoIssues')}</p>
            )}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-[#e6deda] bg-[#fbf8f6] p-3">
          <span
            className={`inline-flex rounded-lg px-3 py-1 text-sm font-semibold ${getStatusBadgeClass(result.status)}`}
          >
            {result.status}
          </span>
          {result.message && <p className="mt-2 text-sm text-[#5c5357]">{result.message}</p>}
        </div>
      )}
    </div>
  );
}
