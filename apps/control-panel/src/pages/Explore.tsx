// Explore page; provides the online skill marketplace search and recommendation view.
import { useTranslation } from 'react-i18next';
import {
  type RemoteSkillApiClient,
  RemoteSkillMarketplace,
} from '../components/RemoteSkillMarketplace';

interface ExploreProps {
  apiClient?: RemoteSkillApiClient;
}

export function Explore({ apiClient }: ExploreProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <section className="rounded-lg border border-[#e5dad7] bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#965276]">SkillGov</div>
        <h1 className="mt-2 text-2xl font-semibold text-[#191619]">{t('exploreHeading')}</h1>
        <p className="mt-1 text-sm text-[#6f676b]">{t('exploreSubtitle')}</p>
      </section>
      <RemoteSkillMarketplace apiClient={apiClient} />
    </div>
  );
}
