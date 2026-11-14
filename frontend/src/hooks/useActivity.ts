// Read the live activity feed from the activity store.
//
// Contents:
//   useActivity: Return the newest activity items; re-renders when a new item arrives.
import { useSyncExternalStore } from 'react';
import { activityStore, type ActivityItem } from '../lib/activity';

/** Return the newest activity items; re-renders when a new item arrives. */
export function useActivity(): ActivityItem[] {
  return useSyncExternalStore(activityStore.subscribe, activityStore.snapshot, activityStore.snapshot);
}
