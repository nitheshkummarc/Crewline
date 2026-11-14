// The page's single polite live region and the hook that writes to it.
//
// Contents:
//   LiveRegionProvider: Provide `useAnnounce` and render the one visually hidden aria-live="polite" region.
//   useAnnounce: Return a function that announces a message in the live region.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Announce = (message: string) => void;

const AnnounceContext = createContext<Announce>(() => undefined);

/** Provide `useAnnounce` and render the one visually hidden aria-live="polite" region. */
export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const counter = useRef(0);
  const announce = useCallback<Announce>((text) => {
    // Clearing first makes screen readers repeat an identical message.
    counter.current += 1;
    const id = counter.current;
    setMessage('');
    window.setTimeout(() => {
      if (id === counter.current) setMessage(text);
    }, 30);
  }, []);
  const value = useMemo(() => announce, [announce]);
  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-region">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}

/** Return a function that announces a message in the live region. */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}
