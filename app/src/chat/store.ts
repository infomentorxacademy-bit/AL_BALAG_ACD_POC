import { useSyncExternalStore } from 'react';

/** A tiny observable state holder (the React Native stand-in for a Riverpod Notifier). */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}

  get state(): T {
    return this.value;
  }

  protected set(next: T): void {
    this.value = next;
    this.listeners.forEach((l) => l());
  }

  /** Merge a partial update. */
  protected patch(partial: Partial<T>): void {
    this.set({ ...this.value, ...partial });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, () => store.state);
}
