// Settings page — language switcher, target agent info, project path, and diagnostics.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { TargetProfile } from '../types';
import type { DoctorResult } from '../types';

interface SettingsProps {
  targetProfiles: TargetProfile[];
  projectRoot: string;
}

export function Settings({ targetProfiles, projectRoot }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const [doctorResult, setDoctorResult] = useState<DoctorResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDoctor = async () => {
    setLoading(true);
    try {
      const result = await api.doctor();
      setDoctorResult(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
        <h2 className="text-base font-semibold mb-4">{t('settings')}</h2>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {t('languageLabel')}
          </h3>
          <select
            value={i18n.language.startsWith('zh') ? 'zh' : 'en'}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {t('projectPath')}
          </h3>
          <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded border border-gray-200 font-mono">
            {projectRoot || t('noProject')}
          </p>
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {t('targetAgentHeading')}
          </h3>
          <div className="space-y-2">
            {targetProfiles.map((p) => (
              <div key={p.id} className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                <div className="font-medium text-sm">{p.label || p.id}</div>
                <div className="text-xs text-gray-500">
                  ID: {p.id} · Link mode: {p.linkMode || '-'}
                </div>
                {p.skillDirs && p.skillDirs.length > 0 && (
                  <div className="text-xs text-gray-400 mt-1">Dirs: {p.skillDirs.join(', ')}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {t('diagnosticsHeading')}
          </h3>
          <button
            type="button"
            onClick={handleDoctor}
            disabled={loading}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {t('doctorButton')}
          </button>
          {doctorResult && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded p-3">
              {doctorResult.issues && doctorResult.issues.length > 0 ? (
                <ul className="space-y-1">
                  {doctorResult.issues.map((issue) => (
                    <li key={issue.message} className="text-sm">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                          issue.severity === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {issue.severity}
                      </span>{' '}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No issues found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
