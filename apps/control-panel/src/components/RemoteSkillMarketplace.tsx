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

export interface MarketplaceSection {
  key: string;
  query: string;
  limit: number;
  titleKey: string;
}

interface RemoteSkillMarketplaceProps {
  apiClient?: RemoteSkillApiClient;
}

export type RemoteSkillSections = Record<string, RemoteSearchResponse['skills']>;

export const MARKETPLACE_SECTIONS: MarketplaceSection[] = [
  { key: 'popular', query: 'skill', limit: 12, titleKey: 'marketplacePopular' },
  { key: 'design', query: 'design', limit: 8, titleKey: 'marketplaceDesign' },
  { key: 'programming', query: 'programming', limit: 8, titleKey: 'marketplaceProgramming' },
  { key: 'dailyWork', query: 'productivity', limit: 8, titleKey: 'marketplaceDailyWork' },
  { key: 'ai', query: 'ai', limit: 8, titleKey: 'marketplaceAI' },
  { key: 'writing', query: 'writing', limit: 8, titleKey: 'marketplaceWriting' },
  { key: 'research', query: 'research', limit: 8, titleKey: 'marketplaceResearch' },
  { key: 'automation', query: 'automation', limit: 8, titleKey: 'marketplaceAutomation' },
  { key: 'documentation', query: 'documentation', limit: 8, titleKey: 'marketplaceDocumentation' },
  { key: 'data', query: 'data', limit: 8, titleKey: 'marketplaceData' },
];

let sectionPreloadCache = new WeakMap<RemoteSkillApiClient, Promise<RemoteSkillSections>>();

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

function normalizeRemoteSkills(data: RemoteSearchResponse): RemoteSearchResponse['skills'] {
  if (!Array.isArray(data.skills)) {
    throw new Error('Remote skill search returned an invalid response.');
  }
  return sortByInstalls(uniqueSkills(data.skills));
}

async function loadRemoteSkillSections(
  apiClient: RemoteSkillApiClient,
): Promise<RemoteSkillSections> {
  const entries = await Promise.all(
    MARKETPLACE_SECTIONS.map(async (section) => {
      try {
        const data = await apiClient.searchRemoteSkills(section.query, section.limit);
        return [section.key, normalizeRemoteSkills(data)] as const;
      } catch {
        return [section.key, []] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export function preloadRemoteSkillSections(
  apiClient: RemoteSkillApiClient = api,
  options: { force?: boolean } = {},
): Promise<RemoteSkillSections> {
  if (options.force) {
    sectionPreloadCache.delete(apiClient);
  }
  let pending = sectionPreloadCache.get(apiClient);
  if (!pending) {
    pending = loadRemoteSkillSections(apiClient).catch((err) => {
      sectionPreloadCache.delete(apiClient);
      throw err;
    });
    sectionPreloadCache.set(apiClient, pending);
  }
  return pending;
}

export function resetRemoteSkillSectionPreload(apiClient?: RemoteSkillApiClient) {
  if (apiClient) {
    sectionPreloadCache.delete(apiClient);
    return;
  }
  sectionPreloadCache = new WeakMap<RemoteSkillApiClient, Promise<RemoteSkillSections>>();
}

export function RemoteSkillMarketplace({ apiClient = api }: RemoteSkillMarketplaceProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RemoteSearchResponse['skills']>([]);
  const [sections, setSections] = useState<RemoteSkillSections>({});
  const [preview, setPreview] = useState<RemoteSkillPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [busySkillId, setBusySkillId] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [activeChannel, setActiveChannel] = useState('all');

  const loadRecommendations = useCallback(
    async (force = false) => {
      setLoadingSections(true);
      setError('');
      try {
        setSections(await preloadRemoteSkillSections(apiClient, { force }));
      } catch (err) {
        setError((err as Error).message);
        setSections({});
      } finally {
        setLoadingSections(false);
      }
    },
    [apiClient],
  );

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
      setSearchResults(normalizeRemoteSkills(data));
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
      await loadRecommendations(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusySkillId('');
    }
  };

  const visibleSections = useMemo(
    () =>
      MARKETPLACE_SECTIONS.map((section) => ({
        ...section,
        skills: sections[section.key] || [],
      })).filter((section) => activeChannel === 'all' || section.key === activeChannel),
    [activeChannel, sections],
  );

  const channelFilters = useMemo(
    () => [
      { key: 'all', titleKey: 'marketplaceAllChannels' },
      ...MARKETPLACE_SECTIONS.map((section) => ({
        key: section.key,
        titleKey: section.titleKey,
      })),
    ],
    [],
  );

  const renderSkill = (skill: RemoteSearchResponse['skills'][number]) => (
    <div key={skill.id} className="rounded-lg border border-[#eadfdd] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#20191d]">{skill.name}</div>
          <div className="mt-0.5 truncate text-xs text-[#756c70]">{skill.source}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {typeof skill.installs === 'number' && (
              <span className="rounded-md bg-[#f1e8ed] px-1.5 py-0.5 text-xs text-[#7c4362]">
                {t('remoteInstallCount', { count: skill.installs })}
              </span>
            )}
            {skill.installed && (
              <span className="rounded-md bg-[#e5f3e4] px-1.5 py-0.5 text-xs text-[#2f6e3d]">
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
            className="rounded-md border border-[#d9cdca] px-2 py-1 text-xs text-[#4a4146] hover:bg-[#f7f1f3] disabled:opacity-50"
          >
            {t('remotePreviewButton')}
          </button>
          <button
            type="button"
            onClick={() => handleInstall(skill.id)}
            disabled={busySkillId === skill.id}
            className="rounded-md border border-[#965276] bg-[#965276] px-2 py-1 text-xs text-white hover:bg-[#874867] disabled:opacity-50"
          >
            {t('remoteInstallButton')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#e5dad7] bg-white p-4 shadow-sm">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearch();
            }}
            placeholder={t('remoteSearchPlaceholder')}
            className="flex-1 rounded-md border border-[#d9cdca] px-3 py-2 text-sm text-[#241f22] outline-none focus:border-[#965276] focus:ring-2 focus:ring-[#ead5df]"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loadingSearch || !query.trim()}
            className="rounded-md border border-[#965276] bg-[#965276] px-4 py-2 text-sm text-white hover:bg-[#874867] disabled:opacity-50"
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
        <section className="rounded-lg border border-[#e5dad7] bg-white p-3 shadow-sm">
          <div className="text-sm font-semibold">{preview.name || preview.id}</div>
          {preview.description && (
            <p className="mt-1 text-sm text-[#635b60]">{preview.description}</p>
          )}
          <p className="mt-1 text-xs text-[#7d7478]">
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

      <section className="rounded-lg border border-[#e5dad7] bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#20191d]">
              {t('marketplaceRecommendations')}
            </h2>
            <p className="mt-1 text-sm font-medium text-[#7c4362]">
              {t('marketplaceChannelsHeading')}
            </p>
          </div>
          {loadingSections && <p className="text-sm text-[#756c70]">{t('loading')}</p>}
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {channelFilters.map((channel) => {
            const isActive = activeChannel === channel.key;
            return (
              <button
                key={channel.key}
                type="button"
                onClick={() => setActiveChannel(channel.key)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'border-[#965276] bg-[#965276] text-white'
                    : 'border-[#ddd0cd] bg-[#fbf8f6] text-[#4a4146] hover:border-[#965276] hover:text-[#965276]'
                }`}
              >
                {t(channel.titleKey)}
              </button>
            );
          })}
        </div>
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <div key={section.key}>
              <h3 className="mb-2 text-sm font-semibold text-[#4a4146]">{t(section.titleKey)}</h3>
              {section.skills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {section.skills.map(renderSkill)}
                </div>
              ) : (
                !loadingSections && <p className="text-sm text-[#756c70]">{t('remoteNoResults')}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
