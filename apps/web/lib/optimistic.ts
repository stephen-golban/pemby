import type { MutationFunctionContext, QueryKey } from "@tanstack/react-query";

/**
 * Optimistic cache update with rollback, for `useMutation` (docs/conventions.md, Optimistic UI).
 *
 *   useMutation({ mutationFn, ...optimisticUpdate(queryKey, (old, vars) => next) })
 *
 * onMutate: cancel in-flight fetches, snapshot the cached value, write the optimistic value.
 * onError:  restore the snapshot.
 * onSettled: refetch so the cache matches the server either way.
 */
export function optimisticUpdate<TData, TVariables>(
  queryKey: QueryKey,
  apply: (previous: TData | undefined, variables: TVariables) => TData,
) {
  return {
    onMutate: async (variables: TVariables, context: MutationFunctionContext) => {
      await context.client.cancelQueries({ queryKey });
      const previous = context.client.getQueryData<TData>(queryKey);
      context.client.setQueryData<TData>(queryKey, (old) => apply(old, variables));
      return { previous };
    },
    onError: (
      _error: unknown,
      _variables: TVariables,
      snapshot: { previous: TData | undefined } | undefined,
      context: MutationFunctionContext,
    ) => {
      if (snapshot) context.client.setQueryData<TData>(queryKey, snapshot.previous);
    },
    onSettled: async (
      _data: unknown,
      _error: unknown,
      _variables: TVariables,
      _snapshot: unknown,
      context: MutationFunctionContext,
    ) => {
      await context.client.invalidateQueries({ queryKey });
    },
  };
}
