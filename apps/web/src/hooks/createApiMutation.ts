import type { UseMutationResult } from '@tanstack/react-query'
import type { CreateApiMutationOptions } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'

const createApiMutation = <TArgs, TResult>(
    apiFn: (args: TArgs) => Promise<TResult>,
    options: CreateApiMutationOptions<TArgs, TResult> = {}
): (() => UseMutationResult<TResult, Error, TArgs>) => {
    const useApiMutation = (): UseMutationResult<TResult, Error, TArgs> => {
        const queryClient = useQueryClient()

        return useMutation<TResult, Error, TArgs>({
            mutationFn: (args: TArgs) => apiFn(args),
            onSuccess: (result, args) => {
                const keys =
                    typeof options.invalidateKeys === 'function'
                        ? options.invalidateKeys(args, result)
                        : options.invalidateKeys
                if (keys) {
                    for (const key of keys) {
                        queryClient.invalidateQueries({ queryKey: key })
                    }
                }
                if (options.onSuccess) {
                    options.onSuccess(result, args, queryClient)
                }
            }
        })
    }

    return useApiMutation
}

export default createApiMutation