/** Frontend data entry points for the in-process backend contract. */

export { BackendProvider, useBackendModule } from './BackendProvider';
export { useApiClient } from './DataApiProvider';
export {
  useBackgroundExecutionStatus,
  useCache,
  useInfiniteQuery,
  useMultiplePreferences,
  useMutation,
  usePersistCache,
  usePreference,
  usePrefetch,
  usePrefetchInfiniteQuery,
  useQuery,
} from './hooks';
export { createMobileQueryClient, QueryProvider } from './QueryProvider';
export { queryKeys } from './queryKeys';
