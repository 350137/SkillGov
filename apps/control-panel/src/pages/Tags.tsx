// Tags page — placeholder for tag-based skill organization; shows empty state when no tags exist.
import { useTranslation } from 'react-i18next';

export function Tags() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold mb-4">{t('tags')}</h2>
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No tags configured yet.</p>
          <p className="text-xs mt-2">
            Tags will be available in a future update to help organize your skills.
          </p>
        </div>
      </div>
    </div>
  );
}
