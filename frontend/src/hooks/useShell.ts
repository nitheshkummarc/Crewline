// Shell context: the current hackathon, its live stream status, and the command palette opener, shared by all signed-in pages.
import { createContext, useContext, useEffect } from 'react';
import type { StreamStatus } from './useEventStream';

export interface ShellState {
  hid: string | null;
  setHid: (hid: string) => void;
  stream: StreamStatus;
  openPalette: () => void;
}

export const ShellContext = createContext<ShellState>({
  hid: null,
  setHid: () => undefined,
  stream: 'connecting',
  openPalette: () => undefined,
});

/** Return the shell state. */
export const useShell = () => useContext(ShellContext);

/** Make a hackathon the current one (its event stream opens in the shell) once its id is known. */
export function useCurrentHackathon(hid: string | null | undefined): void {
  const { setHid } = useShell();
  useEffect(() => {
    if (hid) setHid(hid);
  }, [hid, setHid]);
}
