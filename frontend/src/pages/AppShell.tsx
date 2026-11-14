// Signed-in shell: session gate, layout, the one event stream for the current hackathon, and the command palette.
//
// Contents:
//   isPaletteKey: True if a key press should open the palette (Ctrl+K or Cmd+K).
//   AppShell: Gate every app route behind a session, open one event stream, and wrap the page in the layout.
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FlaskConical, KeyRound, LayoutGrid, LogOut, Plus, Sparkles, UserRound, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { CommandPalette, type PaletteGroup } from '../components/CommandPalette';
import { Layout, type NavItem } from '../components/Layout';
import { LoadError, SkeletonCards } from '../components/LoadState';
import { useLogout } from '../hooks/mutations';
import { useHackathons, useMe, useMyStatus, type TeamsBoardData } from '../hooks/queries';
import { useEventStream } from '../hooks/useEventStream';
import { ShellContext } from '../hooks/useShell';
import { activityStore } from '../lib/activity';
import { keys } from '../lib/keys';
import { clearTombstones } from '../lib/merge';

/** True if a key press should open the palette (Ctrl+K or Cmd+K). */
export const isPaletteKey = (event: KeyboardEvent) => (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';

/** Gate every app route behind a session, open one event stream, and wrap the page in the layout. */
export default function AppShell() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const logout = useLogout();
  const hackathons = useHackathons();
  const routeHid = useMatch('/h/:hid/*')?.params.hid ?? null;
  const [chosenHid, setChosenHid] = useState<string | null>(null);
  const hid = routeHid ?? chosenHid ?? hackathons.data?.[0]?.id ?? null;
  const stream = useEventStream(me.data ? hid ?? undefined : undefined);
  const status = useMyStatus(me.data ? hid ?? '' : '');
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isPaletteKey(event)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setHid = useCallback((next: string) => setChosenHid(next), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const shell = useMemo(() => ({ hid, setHid, stream, openPalette }), [hid, setHid, stream, openPalette]);
  const hackathon = hackathons.data?.find((h) => h.id === hid);
  const myTeam = status.data?.team ?? null;

  const onLogout = () =>
    logout.mutate(undefined, {
      onSettled: () => {
        clearTombstones();
        activityStore.clear();
        navigate('/login', { replace: true });
      },
    });

  const groups = useMemo<PaletteGroup[]>(() => {
    const go = (to: string) => () => navigate(to);
    const board = hid ? client.getQueryData<TeamsBoardData>(keys.teamsBoard(hid)) : undefined;
    const teams = board?.pages.flatMap((page) => page.items).slice(0, 60) ?? [];
    return [
      {
        heading: 'Go to',
        items: [
          { id: 'home', label: 'Hackathons', icon: <LayoutGrid size={16} />, onSelect: go('/') },
          ...(hid ? [{ id: 'board', label: 'Team board', hint: hackathon?.name, icon: <LayoutGrid size={16} />, onSelect: go(`/h/${hid}`) },
            { id: 'people', label: 'People looking', icon: <Users size={16} />, onSelect: go(`/h/${hid}?tab=people`) },
            { id: 'ranked', label: 'Best matches for me', icon: <Sparkles size={16} />, onSelect: go(`/h/${hid}?tab=people&view=ranked`) }] : []),
          ...(myTeam ? [{ id: 'my-team', label: `My team: ${myTeam.name}`, icon: <Users size={16} />, onSelect: go(`/teams/${myTeam.id}`) }] : []),
          { id: 'lab', label: 'Race lab: last-seat race, spam clicks, latency', keywords: ['demo', 'concurrency'], icon: <FlaskConical size={16} />, onSelect: go('/lab') },
          { id: 'profile', label: 'Profile', icon: <UserRound size={16} />, onSelect: go('/me') },
        ],
      },
      {
        heading: 'Actions',
        items: [
          ...(hid && !myTeam ? [{ id: 'create', label: 'Create a team', icon: <Plus size={16} />, onSelect: go(`/h/${hid}/teams/new`) },
            { id: 'join', label: 'Join with a code', keywords: ['invite'], icon: <KeyRound size={16} />, onSelect: go(`/h/${hid}/join`) }] : []),
          { id: 'logout', label: 'Log out', icon: <LogOut size={16} />, onSelect: onLogout },
        ],
      },
      {
        heading: 'Teams with open seats',
        items: teams.map((team) => ({
          id: `team-${team.id}`, label: team.name, hint: `${team.member_count}/${team.max_size}`,
          keywords: team.skills, icon: <ArrowRight size={16} />, onSelect: go(`/teams/${team.id}`),
        })),
      },
    ];
    // The palette list is rebuilt when it opens so it shows the teams cached at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen, hid, hackathon?.name, myTeam?.id, myTeam?.name]);

  if (me.isPending) {
    return <div className="mx-auto max-w-page px-4 pt-20"><SkeletonCards count={3} label="Loading your session" /></div>;
  }
  if (me.error instanceof ApiError && me.error.status === 401) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  }
  if (me.error || !me.data) {
    return <div className="mx-auto max-w-page px-4 pt-20"><LoadError error={me.error} onRetry={() => void me.refetch()} /></div>;
  }

  const nav: NavItem[] = [
    { to: '/', label: 'Home', icon: 'home' },
    ...(hid ? [{ to: `/h/${hid}`, label: 'Board', icon: 'board' as const }] : []),
    ...(myTeam ? [{ to: `/teams/${myTeam.id}`, label: 'My team', icon: 'team' as const }] : []),
    { to: '/lab', label: 'Race lab', icon: 'lab' },
    { to: '/me', label: 'Profile', icon: 'profile' },
  ];
  const context = hackathon ? <span><span className="block text-[12px] text-shell-ink2">Hackathon</span><span className="font-semibold">{hackathon.name}</span></span> : null;

  return (
    <ShellContext.Provider value={shell}>
      <Layout user={me.data} nav={nav} context={context} onLogout={onLogout} onOpenPalette={openPalette}>
        <Outlet />
      </Layout>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={groups} />
    </ShellContext.Provider>
  );
}
