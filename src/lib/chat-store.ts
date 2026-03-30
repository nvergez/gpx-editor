import { create } from 'zustand'

interface ChatStore {
  open: boolean
  toggle: () => void
  setOpen: (open: boolean) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
}))
