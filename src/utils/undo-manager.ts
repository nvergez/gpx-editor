import type { ActivityDocument } from './dom-model'

interface Snapshot {
  xml: string
  lapNames: Map<string, string>
}

const MAX_STACK_SIZE = 50
const MAX_TOTAL_BYTES = 100 * 1024 * 1024 // 100 MB

export class UndoManager {
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private totalBytes = 0

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Capture current state before a mutation. Clears redo stack. */
  snapshot(actDoc: ActivityDocument): void {
    const snap = this.captureState(actDoc)
    this.undoStack.push(snap)
    this.totalBytes += snap.xml.length * 2 // JS strings are UTF-16
    this.evictOldest()
    this.dropRedoStack()
  }

  /** Restore previous state. Returns true if successful. */
  undo(actDoc: ActivityDocument): boolean {
    const prev = this.undoStack.pop()
    if (!prev) return false

    this.totalBytes -= prev.xml.length * 2
    const current = this.captureState(actDoc)
    this.redoStack.push(current)
    this.totalBytes += current.xml.length * 2

    this.restore(actDoc, prev)
    return true
  }

  /** Re-apply undone state. Returns true if successful. */
  redo(actDoc: ActivityDocument): boolean {
    const next = this.redoStack.pop()
    if (!next) return false

    this.totalBytes -= next.xml.length * 2
    const current = this.captureState(actDoc)
    this.undoStack.push(current)
    this.totalBytes += current.xml.length * 2

    this.restore(actDoc, next)
    return true
  }

  /** Clear both stacks (e.g. on new file load). */
  reset(): void {
    this.undoStack = []
    this.redoStack = []
    this.totalBytes = 0
  }

  private captureState(actDoc: ActivityDocument): Snapshot {
    return {
      xml: new XMLSerializer().serializeToString(actDoc.doc),
      lapNames: new Map(actDoc.lapNames),
    }
  }

  private restore(actDoc: ActivityDocument, snapshot: Snapshot): void {
    const newDoc = new DOMParser().parseFromString(snapshot.xml, 'application/xml')
    if (newDoc.querySelector('parsererror')) {
      throw new Error('Failed to restore snapshot: XML parse error')
    }
    actDoc.doc = newDoc
    actDoc.lapNames = snapshot.lapNames
  }

  private evictOldest(): void {
    while (
      this.undoStack.length > MAX_STACK_SIZE ||
      (this.totalBytes > MAX_TOTAL_BYTES && this.undoStack.length > 1)
    ) {
      const evicted = this.undoStack.shift()!
      this.totalBytes -= evicted.xml.length * 2
    }
  }

  private dropRedoStack(): void {
    for (const snap of this.redoStack) {
      this.totalBytes -= snap.xml.length * 2
    }
    this.redoStack = []
  }
}
