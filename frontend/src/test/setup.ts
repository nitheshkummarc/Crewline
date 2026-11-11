// Vitest setup: DOM matchers, a fake EventSource, cleanup between tests, fresh tombstones.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearTombstones } from '../lib/merge';

/** EventSource stand-in for jsdom: records instances so tests can emit events. */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(kind: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), listener]);
  }

  /** Deliver one event of a kind with JSON data. */
  emit(kind: string, data: unknown): void {
    const event = new MessageEvent<string>(kind, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(kind) ?? []) listener(event);
  }

  /** Simulate a successful (re)connect. */
  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }
}

Object.defineProperty(globalThis, 'EventSource', { value: FakeEventSource, writable: true });

afterEach(() => {
  cleanup();
  clearTombstones();
  FakeEventSource.instances = [];
});
