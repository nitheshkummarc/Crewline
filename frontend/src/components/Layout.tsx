// Page shell: skip link, top bar with the user menu, main landmark, footer with legal and contact links.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../api/types';

export const CONTACT_URL = 'https://github.com/nitheshkummarc/Crewline/issues';
export const SOURCE_URL = 'https://github.com/nitheshkummarc/Crewline';

/** The Crewline wordmark: a seat strip and the name in condensed caps. */
export function Wordmark() {
  return (
    <span className="cells inline-flex items-center gap-2 text-[17px] tracking-[0.12em] text-paint">
      <span aria-hidden="true" className="inline-flex gap-[2px]">
        <span className="h-[14px] w-[8px] rounded-sm bg-paint" />
        <span className="h-[14px] w-[8px] rounded-sm bg-paint" />
        <span className="h-[14px] w-[8px] rounded-sm bg-lamp-amber" />
      </span>
      Crewline
    </span>
  );
}

interface LayoutProps {
  user: User | null;
  onLogout?: () => void;
  context?: ReactNode;
  children: ReactNode;
}

/** Header, main content and footer for every page. */
export function Layout({ user, onLogout, context, children }: LayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded bg-paint px-4 py-3 text-board focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-flap-seam bg-board text-paint">
        <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-4">
          <Link to="/" className="inline-flex min-h-touch items-center" aria-label="Crewline home">
            <Wordmark />
          </Link>
          <div className="min-w-0 flex-1 truncate text-sm text-paint-2">{context}</div>
          {user && <UserMenu user={user} onLogout={onLogout} />}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-page flex-1 px-4 pb-28 pt-6 outline-none md:pb-12">
        {children}
      </main>
      <footer className="border-t border-room-line">
        <nav aria-label="Legal and contact" className="mx-auto flex max-w-page flex-wrap gap-x-6 gap-y-2 px-4 py-5 text-sm text-room-ink2">
          <Link to="/privacy" className="inline-flex min-h-touch items-center underline underline-offset-[3px] hover:text-room-ink">Privacy</Link>
          <Link to="/terms" className="inline-flex min-h-touch items-center underline underline-offset-[3px] hover:text-room-ink">Terms</Link>
          <a href={CONTACT_URL} className="inline-flex min-h-touch items-center underline underline-offset-[3px] hover:text-room-ink">Contact</a>
          <a href={SOURCE_URL} className="inline-flex min-h-touch items-center underline underline-offset-[3px] hover:text-room-ink">Source code</a>
        </nav>
      </footer>
    </div>
  );
}

/** The signed-in user's menu: profile and log out. */
function UserMenu({ user, onLogout }: { user: User; onLogout?: (() => void) | undefined }) {
  const item = 'flex min-h-touch cursor-pointer items-center gap-3 rounded px-3 text-[15px] outline-none data-[highlighted]:bg-flap';
  return (
    <Menu.Root>
      <Menu.Trigger className="press inline-flex min-h-touch items-center gap-2 rounded border border-flap-edge px-3 text-sm text-paint">
        <span className="max-w-[120px] truncate sm:max-w-[200px]">{user.display_name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-40 min-w-[200px] rounded-md border border-flap-edge bg-board p-1 text-paint shadow-dialog">
          <Menu.Item asChild>
            <Link to="/me" className={item}><UserRound size={16} aria-hidden="true" />Profile</Link>
          </Menu.Item>
          <Menu.Item className={item} onSelect={() => onLogout?.()}>
            <LogOut size={16} aria-hidden="true" />Log out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** A bar fixed to the bottom on phones that holds the page's primary action; inline on wide screens. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-room-line bg-room px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
      <div className="mx-auto flex max-w-page gap-2 [&>*]:flex-1 md:[&>*]:flex-none">{children}</div>
    </div>
  );
}
