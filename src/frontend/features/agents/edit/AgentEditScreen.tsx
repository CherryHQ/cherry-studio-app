import { useLocalSearchParams } from 'expo-router';

import { AgentEditor } from '@/frontend/components/AgentEditor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export default function AgentEditScreen() {
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    startChat?: string | string[];
  }>();
  const agentId = getSingleRouteParam(params.agentId);
  return (
    <AgentEditor
      agentId={agentId}
      shouldStartChat={!agentId && getSingleRouteParam(params.startChat) === 'true'}
    />
  );
}
