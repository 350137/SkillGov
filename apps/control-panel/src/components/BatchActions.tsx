// Batch actions component — multi-skill operations (check, map, unmap, adopt) with result display.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { getStatusBadgeClass } from '../lib/filterSkills';
import type { BatchResult, TargetProfile } from '../types';
import { ToolSelector } from './ToolSelector';

interface BatchActionsProps {
  selectedNames: string[];
  targetProfiles: TargetProfile[];
  onDeselect: () => void;
  onActionResult: () => void;
}

export function BatchActions({
  selectedNames,
  targetProfiles,
  onDeselect,
  onActionResult,
}: BatchActionsProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState(targetProfiles[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [operation, setOperation] = useState<string>('');

  const runBatch = async (
    op: 'compatBatch' | 'mapBatch' | 'unmapBatch' | 'adoptBatch',
    label: string,
  ) => {
    if (!target || selectedNames.length === 0) return;
    setLoading(true);
    setOperation(label);
    try {
      const data = await api[op](selectedNames, target);
      setResult(data);
      if (op !== 'compatBatch') onActionResult();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
        {t('multiSkillHeading', { count: selectedNames.length })}
      </h3>
      <div className="text-sm text-gray-500 mb-2">
        {t('batchSelected', { count: selectedNames.length })}
      </div>

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-1">
        {t('targetAgentHeading')}
      </h3>
      <ToolSelector targetProfiles={targetProfiles} value={target} onChange={setTarget} />

      <div className="grid grid-cols-3 gap-2 mb-2">
        <button
          type="button"
          onClick={() => runBatch('compatBatch', t('batchCheckCompat'))}
          disabled={loading}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
        >
          {t('batchCheckCompat')}
        </button>
        <button
          type="button"
          onClick={() => runBatch('mapBatch', t('batchMap'))}
          disabled={loading}
          className="w-full px-2 py-1.5 bg-blue-600 text-white border border-blue-700 rounded text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {t('batchMap')}
        </button>
        <button
          type="button"
          onClick={() => runBatch('unmapBatch', t('batchUnmap'))}
          disabled={loading}
          className="w-full px-2 py-1.5 bg-red-600 text-white border border-red-700 rounded text-sm hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
        >
          {t('batchUnmap')}
        </button>
        <button
          type="button"
          onClick={() => runBatch('adoptBatch', t('batchAdopt'))}
          disabled={loading}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
        >
          {t('batchAdopt')}
        </button>
        <button
          type="button"
          onClick={onDeselect}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 whitespace-nowrap"
        >
          {t('deselectAll')}
        </button>
      </div>

      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded p-3 mt-2">
          <div className="flex gap-3 items-center mb-2 text-sm">
            <span className="font-semibold">{operation}</span>
            <span className="text-gray-500">
              {t('resultTarget')}: {target}
            </span>
          </div>
          {result.summary && (
            <div className="flex gap-2 flex-wrap mb-2">
              {Object.entries(result.summary).map(([key, val]) => (
                <div
                  key={key}
                  className="bg-white border border-gray-200 rounded px-3 py-1.5 text-center min-w-[60px]"
                >
                  <div className="text-lg font-bold">{val}</div>
                  <div className="text-xs text-gray-500">{key}</div>
                </div>
              ))}
            </div>
          )}
          {result.results && result.results.length > 0 && (
            <table className="w-full text-sm border-collapse mt-1">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1 px-2">{t('tableSkill')}</th>
                  <th className="py-1 px-2">{t('tableStatus')}</th>
                  <th className="py-1 px-2">{t('resultMessage')}</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.name} className="border-t border-gray-100">
                    <td className="py-1 px-2">{r.name}</td>
                    <td className="py-1 px-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-gray-500">{r.message || r.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
