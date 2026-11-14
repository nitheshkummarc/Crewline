// Race lab hooks: lab info, measured latency, and one mutation per experiment (errors take the shared path).
//
// Contents:
//   useLabInfo: Lab settings and the hidden lab hackathon id.
//   useLabLatency: Server-side latency per route over its recent requests.
//   useLabRun: Run one lab experiment; errors are announced once and shown by the page with ErrorNotice.
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { useAnnounce } from '../components/LiveRegion';
import { messageFor } from '../lib/errors';

/** Lab settings and the hidden lab hackathon id. */
export const useLabInfo = () => useQuery({ queryKey: ['lab'], queryFn: api.labInfo, staleTime: Infinity, retry: false });

/** Server-side latency per route over its recent requests. */
export const useLabLatency = (enabled: boolean) =>
  useQuery({ queryKey: ['lab', 'latency'], queryFn: api.labLatency, enabled, refetchInterval: enabled ? 5000 : false });

/** Run one lab experiment; errors are announced once and shown by the page with ErrorNotice. */
export function useLabRun<TArg, TResult>(run: (arg: TArg) => Promise<TResult>, done: (result: TResult) => string) {
  const announce = useAnnounce();
  return useMutation<TResult, Error, TArg>({
    mutationFn: run,
    retry: false,
    onSuccess: (result) => announce(done(result)),
    onError: (error) => announce(messageFor(error)),
  });
}
