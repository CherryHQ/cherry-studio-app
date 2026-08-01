import type { EndpointType, Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { resolveAihubmixChatRoute } from './custom/aihubmix/aihubmixRouting';

export interface GatewayModelRoute {
  endpointType: EndpointType;
  providerOptionsKey: string;
}

type GatewayModelRouter = (modelId: string) => GatewayModelRoute;

const gatewayModelRouters: Partial<Record<string, GatewayModelRouter>> = {
  aihubmix: resolveAihubmixChatRoute,
  // Desktop also registers DMXAPI here. Mobile has no DMXAPI runtime extension yet; adding only
  // its route would select an adapter the mobile factory cannot construct.
};

export function resolveGatewayRoute(
  provider: Provider,
  model: Model,
): GatewayModelRoute | undefined {
  const router =
    gatewayModelRouters[provider.id] ??
    (provider.presetProviderId ? gatewayModelRouters[provider.presetProviderId] : undefined);
  const route = router?.(model.apiModelId ?? model.modelId);
  return route && provider.endpointConfigs?.[route.endpointType] ? route : undefined;
}
