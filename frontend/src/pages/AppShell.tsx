// Signed-in shell: sends signed-out visitors to /login, renders the layout and the routed page.
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Layout } from '../components/Layout';
import { LoadError, SkeletonRows } from '../components/LoadState';
import { useHackathon, useMe } from '../hooks/queries';
import { useLogout } from '../hooks/mutations';
import { clearTombstones } from '../lib/merge';

/** The hackathon name for /h/:hid routes, shown in the top bar. */
function HackathonName({ hid }: { hid: string }) {
  const hackathon = useHackathon(hid);
  return <span>{hackathon.data?.name ?? ''}</span>;
}

/** Gate every app route behind a session and wrap it in the layout. */
export default function AppShell() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();
  const board = useMatch('/h/:hid/*');

  if (me.isPending) {
    return <div className="mx-auto max-w-page px-4 pt-20"><SkeletonRows rows={3} label="Loading your session" /></div>;
  }
  if (me.error instanceof ApiError && me.error.status === 401) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  }
  if (me.error || !me.data) {
    return <div className="mx-auto max-w-page px-4 pt-20"><LoadError error={me.error} onRetry={() => void me.refetch()} /></div>;
  }

  const onLogout = () =>
    logout.mutate(undefined, {
      onSettled: () => {
        clearTombstones();
        navigate('/login', { replace: true });
      },
    });

  return (
    <Layout user={me.data} onLogout={onLogout} context={board?.params.hid ? <HackathonName hid={board.params.hid} /> : null}>
      <Outlet />
    </Layout>
  );
}
