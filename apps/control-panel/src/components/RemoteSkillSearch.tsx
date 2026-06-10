// Remote skill search component; searches, previews, and imports online skills into the local SkillGov library.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { RemoteInstallResponse, RemoteSearchResponse, RemoteSkillPreview } from '../types';

interface RemoteSkillApiClient {
  searchRemoteSkills: (query: string, limit?: number) => Promise<RemoteSearchResponse>;
  previewRemoteSkill: (remoteId: string) => Promise<RemoteSkillPreview>;
  installRemoteSkill: (remoteId: string) => Promise<RemoteInstallResponse>;
}

interface RemoteSkillSearchProps {
  onInstallComplete: () => void;
  apiClient?: RemoteSkillApiClient;
}

export function RemoteSkillSearch({ onInstallComplete, apiClient = api }: RemoteSkillSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RemoteSearchResponse['skills']>([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState<RemoteSkillPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingInstall, setLoadingInstall] = useState(false);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoadingSearch(true);
    setError('');
    setMessage('');
    setPreview(null);
    setSelectedId('');
    setHasSearched(true);
    try {
      const data = await apiClient.searchRemoteSkills(q, 20);
      setResults(data.skills);
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handlePreview = async (remoteId: string) => {
    setSelectedId(remoteId);
    setLoadingPreview(true);
    setError('');
    setMessage('');
    try {
      setPreview(await apiClient.previewRemoteSkill(remoteId));
    } catch (err) {
      setPreview(null);
      setError((err as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleInstall = async () => {
    if (!selectedId || preview?.status !== 'pass') return;
    setLoadingInstall(true);
    setError('');
    setMessage('');
    try {
      const result = await apiClient.installRemoteSkill(selectedId);
      setMessage(result.message || result.status);
      if (result.status === 'pass') {
        onInstallComplete();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingInstall(false);
    }
  };

  return (
    <div className="mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSearch();
          }}
          placeholder={t('remoteSearchPlaceholder')}
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loadingSearch || !query.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white border border-blue-700 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {t('remoteSearchButton')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {message && <p className="text-sm text-green-700 mt-2">{message}</p>}
      {hasSearched && !loadingSearch && results.length === 0 && !error && (
        <p className="text-sm text-gray-500 mt-2">{t('remoteNoResults')}</p>
      )}

      {results.length > 0 && (
        <div className="mt-3 divide-y divide-gray-200 border border-gray-200 bg-white rounded">
          {results.map((skill) => (
            <div key={skill.id} className="p-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{skill.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {skill.source}
                  {typeof skill.installs === 'number'
                    ? ` - ${t('remoteInstallCount', { count: skill.installs })}`
                    : ''}
                  {skill.installed ? ` - ${t('remoteAlreadyInstalled')}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePreview(skill.id)}
                disabled={loadingPreview && selectedId === skill.id}
                className="px-2.5 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {t('remotePreviewButton')}
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="mt-3 border border-gray-200 bg-white rounded p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">{preview.name || preview.id}</div>
              {preview.description && (
                <p className="text-sm text-gray-600 mt-1">{preview.description}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {t('remotePreviewMeta', {
                  files: preview.fileCount,
                  bytes: preview.totalBytes,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleInstall}
              disabled={loadingInstall || preview.status !== 'pass'}
              className="px-3 py-1.5 bg-green-600 text-white border border-green-700 rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {t('remoteInstallButton')}
            </button>
          </div>
          {preview.issues.length > 0 && (
            <ul className="mt-2 text-sm text-red-600">
              {preview.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
