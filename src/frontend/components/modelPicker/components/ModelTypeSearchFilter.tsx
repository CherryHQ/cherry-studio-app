import type { AppSearchFilterProps } from '@/frontend/components/appSearch';

import type { ModelTypeCounts, ModelTypeFilter } from '../utils/modelTypeFilter';
import { ModelTypeFilterBar } from './ModelTypeFilterBar';

/** Adapts model-type counts to the fixed filter area in the shared search view. */
export function ModelTypeSearchFilter({
  context: counts,
  onChange,
  value,
}: AppSearchFilterProps<ModelTypeFilter, ModelTypeCounts>) {
  return <ModelTypeFilterBar counts={counts} onSelect={onChange} selectedFilter={value} />;
}
