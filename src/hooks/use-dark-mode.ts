import { useSyncExternalStore } from 'react'

// Singleton observer shared across all subscribers
const listeners = new Set<() => void>()
let currentDarkMode = false
let observerInitialized = false

function ensureObserver() {
  if (observerInitialized) return
  observerInitialized = true
  currentDarkMode = document.documentElement.classList.contains('dark')
  const observer = new MutationObserver(() => {
    const next = document.documentElement.classList.contains('dark')
    if (next !== currentDarkMode) {
      currentDarkMode = next
      listeners.forEach((l) => l())
    }
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

function subscribe(onStoreChange: () => void) {
  ensureObserver()
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

function getSnapshot() {
  ensureObserver()
  return currentDarkMode
}

/** Reactive dark mode detection via a singleton MutationObserver. Client-only. */
export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
