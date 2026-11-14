// Command palette (Ctrl+K or Cmd+K): jump to pages and teams or run actions from the keyboard.
//
// Contents:
//   CommandPalette: A searchable list of actions in a dialog; arrow keys move, Enter runs, Escape closes.
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
  icon?: ReactNode;
  onSelect: () => void;
}

export interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: PaletteGroup[];
}

/** A searchable list of actions in a dialog; arrow keys move, Enter runs, Escape closes. */
export function CommandPalette({ open, onOpenChange, groups }: Props) {
  const run = (item: PaletteItem) => {
    onOpenChange(false);
    item.onSelect();
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)]" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-2 outline-none data-[state=open]:animate-[pop-in_160ms_cubic-bezier(0.2,0.8,0.2,1)]">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Type to search pages, teams and actions.</Dialog.Description>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} aria-hidden="true" className="text-ink-2" />
              <Command.Input placeholder="Search pages, teams and actions"
                className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-2" />
              <kbd className="rounded-sm border border-line px-[6px] text-[12px] text-ink-2">Esc</kbd>
            </div>
            <Command.List className="max-h-[56vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-ink-2">No match. Try a team name or "join".</Command.Empty>
              {groups.filter((group) => group.items.length > 0).map((group) => (
                <Command.Group key={group.heading} heading={group.heading}
                  className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3">
                  {group.items.map((item) => (
                    <Command.Item key={item.id} value={`${item.label} ${item.id}`} keywords={item.keywords} onSelect={() => run(item)}
                      className="flex min-h-touch cursor-pointer items-center gap-3 rounded px-3 text-[15px] text-ink data-[selected=true]:bg-surface-2">
                      <span aria-hidden="true" className="flex w-5 justify-center text-ink-2">{item.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="shrink-0 text-[13px] text-ink-2">{item.hint}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
