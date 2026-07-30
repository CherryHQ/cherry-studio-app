import {
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useDataServices } from '@/runtime';
import type { DataServices } from '@/runtime/createDataServices';

type DataMutationFunction<TData, TVariables> = (
  services: DataServices,
  variables: TVariables,
) => Promise<TData>;

type DataMutationOptions<TData, TError, TVariables, TContext> = Omit<
  UseMutationOptions<TData, TError, TVariables, TContext>,
  'mutationFn'
> & {
  invalidateQueries?: QueryKey[];
  mutationFn: DataMutationFunction<TData, TVariables>;
};

export function useDataMutation<TData, TError = Error, TVariables = void, TContext = unknown>(
  options: DataMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const services = useDataServices();
  const queryClient = useQueryClient();
  const { invalidateQueries, mutationFn, onSuccess, ...mutationOptions } = options;

  return useMutation({
    ...mutationOptions,
    mutationFn: (variables) => mutationFn(services, variables),
    onSuccess: async (data, variables, onMutateResult, context) => {
      await Promise.all(
        (invalidateQueries ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );

      await onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
