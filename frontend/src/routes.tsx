// Route table: the single list of client routes, used by the app and by the link checker test.
//
// Contents:
//   page: Wrap a lazy page in Suspense with skeleton cards as the fallback.
//   isKnownRoute: True if a path is served by a real route (not the 404 catch-all).
import { lazy, Suspense, type ReactNode } from 'react';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { SkeletonCards } from './components/LoadState';
import AppShell from './pages/AppShell';
import { NotFoundPage, PrivacyPage, TermsPage } from './pages/LegalPages';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';

const HackathonsPage = lazy(() => import('./pages/HackathonsPage'));
const BoardPage = lazy(() => import('./pages/BoardPage'));
const CreateTeamPage = lazy(() => import('./pages/CreateTeamPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LabPage = lazy(() => import('./pages/LabPage'));

/** Wrap a lazy page in Suspense with skeleton cards as the fallback. */
const page = (element: ReactNode) => <Suspense fallback={<SkeletonCards count={3} />}>{element}</Suspense>;

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: page(<HackathonsPage />) },
      { path: '/h/:hid', element: page(<BoardPage />) },
      { path: '/h/:hid/teams/new', element: page(<CreateTeamPage />) },
      { path: '/h/:hid/join', element: page(<JoinPage />) },
      { path: '/teams/:tid', element: page(<TeamPage />) },
      { path: '/me', element: page(<ProfilePage />) },
      { path: '/lab', element: page(<LabPage />) },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

/** True if a path is served by a real route (not the 404 catch-all). */
export function isKnownRoute(path: string): boolean {
  const pathname = path.split(/[?#]/)[0] ?? path;
  const matches = matchRoutes(routes, pathname);
  return Boolean(matches && matches[matches.length - 1]?.route.path !== '*');
}
