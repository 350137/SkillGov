// Explore page; provides the online skill marketplace search and recommendation view.
import {
  type RemoteSkillApiClient,
  RemoteSkillMarketplace,
} from '../components/RemoteSkillMarketplace';

interface ExploreProps {
  apiClient?: RemoteSkillApiClient;
}

export function Explore({ apiClient }: ExploreProps) {
  return (
    <div className="p-4">
      <RemoteSkillMarketplace apiClient={apiClient} />
    </div>
  );
}
