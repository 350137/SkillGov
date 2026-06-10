// Skill detail component; displays selected skill info, compatibility checks, and single-skill operations.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import {
  formatAppliedAgents,
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
      <div className="font-semibold text-base mb-0.5">{skill.name}</div>
      <div className="text-sm text-gray-500 mb-3">
        {agents.length > 0
          ? `${t('tableAppliedAgentsChip')}: ${agents.join(' - ')}`
          : `${t('tableAppliedAgentsChip')}: ${t('none')}`}
      </div>

      <section className="mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          {t('skillIntroHeading')}
        </h3>
        <p className="text-sm text-gray-700 whitespace-normal break-words">
          {description || t('noSkillPurpose')}
        </p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <span className="block text-gray-500">{t('tableSourceLabel')}</span>
            <span className="font-medium text-gray-700">
              {skill.sourceLabel || skill.source || '-'}
            </span>
          </div>
          <div>
            <span className="block text-gray-500">{t('validationStatusLabel')}</span>
            <span
              className={`inline-block px-2 py-0.5 rounded-full font-semibold ${getStatusBadgeClass(skill.validationStatus || '')}`}
            >
              {skill.validationStatus || '-'}
            </span>
          </div>
          {descriptionReviewStatus && (
            <div>
              <span className="block text-gray-500">{t('descriptionReviewStatus')}</span>
              <span className="font-medium text-gray-700">{descriptionReviewStatus}</span>
            </div>
          )}
          {descriptionSource && (
            <div>
              <span className="block text-gray-500">{t('descriptionSource')}</span>
              <span className="font-medium text-gray-700">{descriptionSource}</span>
            </div>
          )}
        </div>
      </section>

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-1">
        {t('targetAgentHeading')}
      </h3>
      <ToolSelector targetProfiles={targetProfiles} value={target} onChange={setTarget} />

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-1">
        {t('compatibilityHeading')}
      </h3>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={handleCompat}
          disabled={loading}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {t('checkButton')}
        </button>
      </div>

      {compatResult && (
        <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-2">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(compatResult.status)}`}
          >
            {compatResult.status}
          </span>
          {compatResult.reason && (
            <p className="text-sm text-gray-600 mt-1">{compatResult.reason}</p>
          )}
          {compatResult.suggestedAction && (
            <p className="text-sm text-gray-500 mt-1">
              <strong>{t('checkButton')}:</strong> {compatResult.suggestedAction}
            </p>
          )}
          {compatResult.issues && compatResult.issues.length > 0 && (
            <ul className="mt-1">
              {compatResult.issues.map((issue) => (
                <li key={issue.message} className="text-sm py-0.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs ${getStatusBadgeClass(issue.severity === 'error' ? 'fail' : issue.severity === 'warning' ? 'fixable' : 'pass')}`}
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
              <p className="text-sm text-gray-500 mt-1">{t('compatNoIssues')}</p>
            )}
        </div>
      )}

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-1">
        {t('mappingHeading')}
      </h3>
      <div className="flex gap-2 mb-2 flex-wrap">
        <button
          type="button"
          onClick={() => handleAction('map')}
          disabled={loading}
          className="px-3 py-1.5 bg-blue-600 text-white border border-blue-700 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {t('mapButton')}
        </button>
        <button
          type="button"
          onClick={() => handleAction('unmap')}
          disabled={loading}
          className="px-3 py-1.5 bg-red-600 text-white border border-red-700 rounded text-sm hover:bg-red-700 disabled:opacity-50"
        >
          {t('unmapButton')}
        </button>
        <button
          type="button"
          onClick={() => handleAction('adopt')}
          disabled={loading}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {t('adoptButton')}
        </button>
      </div>

      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded p-2">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(result.status)}`}
          >
            {result.status}
          </span>
          {result.message && <p className="text-sm text-gray-600 mt-1">{result.message}</p>}
        </div>
      )}
    </div>
  );
}
