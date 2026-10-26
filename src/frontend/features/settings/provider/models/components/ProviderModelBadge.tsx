import { ModelPickerBadge } from '@/frontend/components/ModelPicker/components/ModelPickerBadge';

import type { ProviderModelBadge as ProviderModelBadgeValue } from '../utils/providerModelBadges';

/** A compact, inert visual mark; the containing row owns its spoken label. */
export function ProviderModelBadge({ badge }: { badge: ProviderModelBadgeValue }) {
  return <ModelPickerBadge badge={badge} testIDPrefix="provider-model-badge" />;
}
