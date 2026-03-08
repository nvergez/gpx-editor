import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

/** Returns true on the client after hydration, false during SSR. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
