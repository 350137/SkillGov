// Remote skill marketplace component; searches online skills and shows downloaded-count recommendations.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { RemoteInstallResponse, RemoteSearchResponse, RemoteSkillPreview } from '../types';

export interface RemoteSkillApiClient {
  searchRemoteSkills: (query: string, limit?: number) => Promise<RemoteSearchResponse>;
  previewRemoteSkill: (remoteId: string) => Promise<RemoteSkillPreview>;
  installRemoteSkill: (remoteId: string) => Promise<RemoteInstallResponse>;
}

interface MarketplaceSection {
  key: string;
  query: string;
  limit: number;
  titleKey: string;
}

interface RemoteSkillMarketplaceProps {
  apiClient?: RemoteSkillApiClient;
}

const SECTIONS: MarketplaceSection[] = [
  { key: 'popular', query: 'skill', limit: 12, titleKey: 'marketplacePopular' },
  { key: 'design', query: 'design', limit: 8, titleKey: 'marketplaceDesign' },
  { key: 'programming', query: 'programming', limit: 8, titleKey: 'marketplaceProgramming' },
  { key: 'dailyWork', query: 'productivity', limit: 8, titleKey: 'marketplaceDailyWork' },
];

function sortByInstalls(skills: RemoteSearchResponse['skills']): RemoteSearchResponse['skills'] {
  return [...skills].sort((a, b) => {
    const installDiff = (b.installs || 0) - (a.installs || 0);
    if (installDiff !== 0) return installDiff;
    return a.name.localeCompare(b.name);
  });
}

function uniqueSkills(skills: RemoteSearchResponse['skills']): RemoteSearchResponse['skills'] {
  const seen = new Set<string>();
  const result: RemoteSearchResponse['skills'] = [];
  for (const skill of skills) {
    if (seen.has(skill.id)) continue;
    seen.add(skill.id);
    result.push(skill);
  }
  return result;
}

export function RemoteSkillMarketplace({ apiClient = api }: RemoteSkillMarketplaceProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RemoteSearchResponse['skills']>([]);
  const [sections, setSections] = useState<Record<string, RemoteSearchResponse['skills']>>({});
  const [preview, setPreview] = useState<RemoteSkillPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [busySkillId, setBusySkillId] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const loadRecommendations = useCallback(async () => {
    setLoadingSections(true);
    setError('');
    try {
      const entries = await Promise.all(
        SECTIONS.map(async (section) => {
          const data = await apiClient.searchRemoteSkills(section.query, section.limit);
          return [section.key, sortByInstalls(uniqueSkills(data.skills))] as const;
        }),
      );
      setSections(Object.fromEntries(entries));
    } catch (err) {
      setError((err as Error).message);
      setSections({});
    } finally {
      setLoadingSections(false);
    }
  }, [apiClient]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoadingSearch(true);
    setHasSearched(true);
    setError('');
    setMessage('');
    setPreview(null);
    try {
      const data = await apiClient.searchRemoteSkills(q, 24);
      setSearchResults(sortByInstalls(uniqueSkills(data.skills)));
    } catch (err) {
      setSearchResults([]);
      setError((err as Error).message);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handlePreview = async (remoteId: string) => {
    setBusySkillId(remoteId);
    setError('');
    setMessage('');
    try {
      setPreview(await apiClient.previewRemoteSkill(remoteId));
    } catch (err) {
      setPreview(null);
      setError((err as Error).message);
    } finally {
      setBusySkillId('');
    }
  };

  const handleInstall = async (remoteId: string) => {
    setBusySkillId(remoteId);
    setError('');
    setMessage('');
    try {
      const checked = await apiClient.previewRemoteSkill(remoteId);
      setPreview(checked);
      if (checked.status !== 'pass') {
        setError(t('remoteInstallBlocked'));
        return;
      }
      const result = await apiClient.installRemoteSkill(remoteId);
      setMessage(result.message || result.status);
      await loadRecommendations();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusySkillId('');
    }
  };

  const visibleSections = useMemo(
    () => SECTIONS.map((section) => ({ ...section, skills: sections[section.key] || [] })),
    [sections],
  );

  const renderSkill = (skill: RemoteSearchResponse['skills'][number]) => (
    <div key={skill.id} className="border border-gray-200 bg-white rounded p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">{skill.name}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">{skill.source}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {typeof skill.installs === 'number' && (
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
                {t('remoteInstallCount', { count: skill.installs })}
              </span>
            )}
            {skill.installed && (
              <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs">
                {t('remoteAlreadyInstalled')}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handlePreview(skill.id)}
            disabled={busySkillId === skill.id}
            className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            {t('remotePreviewButton')}
          </button>
          <button
            type="button"
            onClick={() => handleInstall(skill.id)}
            disabled={busySkillId === skill.id}
            className="px-2 py-1 bg-blue-600 text-white border border-blue-700 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
          >
            {t('remoteInstallButton')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearch();
            }}
            placeholder={t('remoteSearchPlaceholder')}
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loadingSearch || !query.trim()}
            className="px-4 py-2 bg-blue-600 text-white border border-blue-700 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {t('remoteSearchButton')}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      {hasSearched && (
        <section>
          <h2 className="text-base font-semibold mb-2">{t('marketplaceSearchResults')}</h2>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {searchResults.map(renderSkill)}
            </div>
          ) : (
            !loadingSearch && <p className="text-sm text-gray-500">{t('remoteNoResults')}</p>
          )}
        </section>
      )}

      {preview && (
        <section className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="font-semibold text-sm">{preview.name || preview.id}</div>
          {preview.description && (
            <p className="text-sm text-gray-600 mt-1">{preview.description}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {t('remotePreviewMeta', { files: preview.fileCount, bytes: preview.totalBytes })}
          </p>
          {preview.issues.length > 0 && (
            <ul className="mt-2 text-sm text-red-600">
              {preview.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold mb-2">{t('marketplaceRecommendations')}</h2>
        {loadingSections && <p className="text-sm text-gray-500">{t('loading')}</p>}
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <div key={section.key}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{t(section.titleKey)}</h3>
              {section.skills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {section.skills.map(renderSkill)}
                </div>
              ) : (
                !loadingSections && <p className="text-sm text-gray-500">{t('remoteNoResults')}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
