// App shell: skip link, navy sidebar on wide screens, navy top bar and bottom tab bar on phones, theme switch, footer links.
//
// Contents:
//   Wordmark: The Crewline wordmark: three seat tabs, the last one open, and the name.
//   Layout: Sidebar layout on wide screens, top bar plus bottom tabs on phones.
//   SideLink: Sidebar link with an icon; highlighted on the current page.
//   TabLink: Bottom tab bar link for phones: icon and label.
//   UserMenu: Sidebar account button with avatar, name and email; opens the account menu.
//   AccountMenuContent: Account menu items: Profile and Log out.
//   FooterLinks: Privacy, terms, contact and source links; `onShell` for the navy sidebar.
//   ActionBar: The page's primary action: a bar above the tab bar on phones, inline on wide screens.
import * as Menu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { Command as CommandIcon, FlaskConical, Home, LayoutGrid, LogOut, Search, UserRound, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { User } from '../api/types';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';

export const CONTACT_URL = 'https://github.com/nitheshkummarc/Crewline/issues';
export const SOURCE_URL = 'https://github.com/nitheshkummarc/Crewline';

/** The Crewline wordmark: three seat tabs, the last one open, and the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className="inline-flex items-end gap-[3px]">
        <span className="h-4 w-[9px] rounded-sm" style={{ background: 'var(--band-0)' }} />
        <span className="h-4 w-[9px] rounded-sm" style={{ background: 'var(--band-1)' }} />
        <span className="h-4 w-[9px] rounded-sm border-2 border-dashed border-current" />
      </span>
      <span className="display text-[19px] leading-6">Crewline</span>
    </span>
  );
}

export interface NavItem {
  to: string;
  label: string;
  icon: 'home' | 'board' | 'team' | 'profile' | 'lab';
}

const ICONS = { home: Home, board: LayoutGrid, team: Users, profile: UserRound, lab: FlaskConical } as const;

interface LayoutProps {
  user: User;
  nav: NavItem[];
  context?: ReactNode;
  onLogout: () => void;
  onOpenPalette: () => void;
  children: ReactNode;
}

/** Sidebar layout on wide screens, top bar plus bottom tabs on phones. */
export function Layout({ user, nav, context, onLogout, onOpenPalette, children }: LayoutProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 rounded bg-plate px-4 py-3 text-plate-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 bg-shell px-4 py-5 text-shell-ink lg:flex">
        <Link to="/" className="inline-flex min-h-touch items-center px-2" aria-label="Crewline home"><Wordmark /></Link>
        {context && <div className="rounded-md bg-shell-2 px-3 py-2 text-sm">{context}</div>}
        <button type="button" onClick={onOpenPalette}
          className="press flex min-h-touch items-center gap-3 rounded border border-shell-2 bg-shell-2 px-3 text-sm text-shell-ink2 hover:border-shell-ink2 hover:text-shell-ink">
          <Search size={16} aria-hidden="true" /> <span className="flex-1 text-left">Search or jump to</span>
          <kbd className="inline-flex items-center gap-1 rounded-sm border border-shell-ink2 px-[6px] text-[12px]"><CommandIcon size={11} aria-hidden="true" />K</kbd>
        </button>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map((item) => <SideLink key={item.to} item={item} />)}
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <ThemeToggle onShell className="self-start" />
          <UserMenu user={user} onLogout={onLogout} />
          <FooterLinks onShell />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-shell px-4 text-shell-ink lg:hidden">
        <Link to="/" className="inline-flex min-h-touch items-center" aria-label="Crewline home"><Wordmark /></Link>
        <div className="min-w-0 flex-1 truncate text-sm text-shell-ink2">{context}</div>
        <button type="button" onClick={onOpenPalette} aria-label="Search or jump to"
          className="press inline-flex h-11 w-11 items-center justify-center rounded text-shell-ink hover:bg-shell-2">
          <Search size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-w-0 flex-col">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-page flex-1 px-4 pb-40 pt-6 outline-none md:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
        <footer className="border-t border-line px-4 pb-24 pt-4 lg:hidden"><FooterLinks /></footer>
      </div>

      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length + 1}, minmax(0, 1fr))` }}>
        {nav.map((item) => <TabLink key={item.to} item={item} />)}
        <Menu.Root>
          <Menu.Trigger className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-2">
            <Avatar id={user.id} name={user.display_name} size="sm" className="h-6 w-6 text-[10px] ring-0" />
            Account
          </Menu.Trigger>
          <AccountMenuContent user={user} onLogout={onLogout} />
        </Menu.Root>
      </nav>
    </div>
  );
}

/** Sidebar link with an icon; highlighted on the current page. */
function SideLink({ item }: { item: NavItem }) {
  const Icon = ICONS[item.icon];
  return (
    <NavLink to={item.to} end={item.icon === 'home'}
      className={({ isActive }) => clsx('press flex min-h-touch items-center gap-3 rounded px-3 font-medium',
        isActive ? 'bg-brand text-brand-ink shadow-1' : 'text-shell-ink2 hover:bg-shell-2 hover:text-shell-ink')}>
      <Icon size={18} aria-hidden="true" /> {item.label}
    </NavLink>
  );
}

/** Bottom tab bar link for phones: icon and label. */
function TabLink({ item }: { item: NavItem }) {
  const Icon = ICONS[item.icon];
  return (
    <NavLink to={item.to} end={item.icon === 'home'}
      className={({ isActive }) => clsx('flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold',
        isActive ? 'text-ink' : 'text-ink-2')}>
      {({ isActive }) => (
        <>
          <span className={clsx('flex h-7 w-12 items-center justify-center rounded-md transition-colors', isActive && 'bg-brand text-brand-ink')}>
            <Icon size={18} aria-hidden="true" />
          </span>
          {item.label}
        </>
      )}
    </NavLink>
  );
}

/** Sidebar account button with avatar, name and email; opens the account menu. */
function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="press flex min-h-touch w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-shell-2">
        <Avatar id={user.id} name={user.display_name} size="sm" className="ring-shell" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{user.display_name}</span>
          <span className="block truncate text-[12px] text-shell-ink2">{user.email}</span>
        </span>
      </Menu.Trigger>
      <AccountMenuContent user={user} onLogout={onLogout} />
    </Menu.Root>
  );
}

/** Account menu items: Profile and Log out. */
function AccountMenuContent({ onLogout }: { user: User; onLogout: () => void }) {
  const item = 'flex min-h-touch cursor-pointer items-center gap-3 rounded px-3 text-[15px] outline-none data-[highlighted]:bg-surface-2';
  return (
    <Menu.Portal>
      <Menu.Content align="end" side="top" sideOffset={8} className="card z-40 min-w-[220px] p-1 shadow-2">
        <Menu.Item asChild>
          <Link to="/me" className={item}><UserRound size={16} aria-hidden="true" />Profile</Link>
        </Menu.Item>
        <Menu.Item className={item} onSelect={onLogout}>
          <LogOut size={16} aria-hidden="true" />Log out
        </Menu.Item>
      </Menu.Content>
    </Menu.Portal>
  );
}

/** Privacy, terms, contact and source links; `onShell` for the navy sidebar. */
export function FooterLinks({ onShell = false }: { onShell?: boolean }) {
  const link = clsx('inline-flex min-h-touch items-center underline underline-offset-[3px]', onShell ? 'hover:text-shell-ink' : 'hover:text-ink');
  return (
    <nav aria-label="Legal and contact" className={clsx('flex flex-wrap gap-x-4 px-2 text-[13px]', onShell ? 'text-shell-ink2' : 'text-ink-2')}>
      <Link to="/privacy" className={link}>Privacy</Link>
      <Link to="/terms" className={link}>Terms</Link>
      <a href={CONTACT_URL} className={link}>Contact</a>
      <a href={SOURCE_URL} className={link}>Source</a>
    </nav>
  );
}

/** The page's primary action: a bar above the tab bar on phones, inline on wide screens. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface px-4 py-3 shadow-2 md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <div className="flex gap-2 [&>*]:flex-1 md:[&>*]:flex-none">{children}</div>
    </div>
  );
}
