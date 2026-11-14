// App root: query client with the session rule, live region, motion settings and the router.
//
// Contents:
//   createQueryClient: Build the query client; any 401 refetches the session so the app shell sends the user to
//       login.
//   Routes: Render the route table.
//   App: The whole app.
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { ApiError } from './api/client';
import { LiveRegionProvider } from './components/LiveRegion';
import { keys } from './lib/keys';
import { routes } from './routes';

const Devtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null;

/** Build the query client; any 401 refetches the session so the app shell sends the user to login. */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true } },
    queryCache: new QueryCache({ onError: (error, query) => onUnauthenticated(error, query.queryKey[0] === 'me') }),
    mutationCache: new MutationCache({ onError: (error) => onUnauthenticated(error, false) }),
  });
  const onUnauthenticated = (error: unknown, isMeQuery: boolean) => {
    if (!isMeQuery && error instanceof ApiError && error.code === 'unauthenticated') {
      void client.invalidateQueries({ queryKey: keys.me() });
    }
  };
  return client;
}

/** Render the route table. */
function Routes() {
  return useRoutes(routes);
}

/** The whole app. */
export default function App() {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <LiveRegionProvider>
            <BrowserRouter>
              <Routes />
            </BrowserRouter>
          </LiveRegionProvider>
        </MotionConfig>
      </LazyMotion>
      <Suspense fallback={null}><Devtools buttonPosition="bottom-left" /></Suspense>
    </QueryClientProvider>
  );
}
