import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'
import type { UIMessage } from 'ai'
import { Button } from '~/components/ui/button'
import {
  Send,
  Loader2,
  X,
  Pencil,
  Scissors,
  Merge,
  Sparkles,
  Check,
  AlertCircle,
  MapPin,
  Ban,
} from 'lucide-react'
import type { ActivityDocument, LapHandle } from '~/utils/dom-model'
import { formatDistance, formatDuration, formatPace, formatSpeed } from '~/utils/gpx-parser'
import * as m from '~/paraglide/messages.js'

interface MutationCallbacks {
  onRenameActivity: (name: string) => void
  onRenameLap: (lapId: string, name: string) => void
  onSplitLap: (lapId: string, pointIndices: number[]) => void
  onMergeLaps: (lapIds: [string, string]) => void
}

interface ActivityChatProps extends MutationCallbacks {
  actDoc: ActivityDocument
  revision: number
  laps: LapHandle[]
  onClose: () => void
}

function computeEqualSplitIndices(pointCount: number, parts: number): number[] {
  const indices: number[] = []
  for (let i = 1; i < parts; i++) {
    indices.push(Math.round((i * pointCount) / parts))
  }
  return indices
}

function buildActivityContext(actDoc: ActivityDocument, laps: LapHandle[]) {
  return {
    name: actDoc.name,
    format: actDoc.sourceFormat,
    laps: laps.map((lap) => ({
      id: lap.id,
      name: lap.name,
      distance: formatDistance(lap.stats.distance),
      duration: formatDuration(lap.stats.duration),
      elevationGain: lap.stats.elevationGain,
      pointCount: lap.pointCount,
    })),
  }
}

interface ToolMeta {
  label: string
  icon: typeof Pencil
  requiresApproval: boolean
}

const TOOL_META: Record<string, ToolMeta> = {
  renameActivity: { label: m.chat_tool_rename_activity(), icon: Pencil, requiresApproval: true },
  renameLap: { label: m.chat_tool_rename_lap(), icon: Pencil, requiresApproval: true },
  splitLap: { label: m.chat_tool_split_lap(), icon: Scissors, requiresApproval: true },
  mergeLaps: { label: m.chat_tool_merge_laps(), icon: Merge, requiresApproval: true },
  getLapDetails: { label: m.chat_tool_get_details(), icon: MapPin, requiresApproval: false },
}

/** Build a short human-readable description of what a tool call will do */
function describeToolCall(name: string, args: Record<string, unknown>, laps: LapHandle[]): string {
  const findLap = (id: string) => laps.find((l) => l.id === id)

  switch (name) {
    case 'renameActivity':
      return m.chat_desc_rename_activity({ name: args.name as string })
    case 'renameLap': {
      const lap = findLap(args.lapId as string)
      return m.chat_desc_rename_lap({ oldName: lap?.name ?? 'lap', newName: args.name as string })
    }
    case 'splitLap': {
      const lap = findLap(args.lapId as string)
      return m.chat_desc_split_lap({ name: lap?.name ?? 'lap', parts: String(args.parts) })
    }
    case 'mergeLaps': {
      const lap1 = findLap(args.lapId1 as string)
      const lap2 = findLap(args.lapId2 as string)
      return m.chat_desc_merge_laps({ lap1: lap1?.name ?? 'lap', lap2: lap2?.name ?? 'lap' })
    }
    default:
      return name
  }
}

function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  laps: LapHandle[],
  callbacks: MutationCallbacks,
): string {
  switch (toolName) {
    case 'renameActivity': {
      const name = args.name as string
      callbacks.onRenameActivity(name)
      return `Activity renamed to "${name}"`
    }
    case 'renameLap': {
      const { lapId, name } = args as { lapId: string; name: string }
      callbacks.onRenameLap(lapId, name)
      return `Lap renamed to "${name}"`
    }
    case 'splitLap': {
      const { lapId, parts } = args as { lapId: string; parts: number }
      const lap = laps.find((l) => l.id === lapId)
      if (!lap) return `Error: Lap ${lapId} not found`
      const indices = computeEqualSplitIndices(lap.pointCount, parts)
      callbacks.onSplitLap(lapId, indices)
      return `Lap "${lap.name}" split into ${parts} equal parts`
    }
    case 'mergeLaps': {
      const { lapId1, lapId2 } = args as { lapId1: string; lapId2: string }
      callbacks.onMergeLaps([lapId1, lapId2])
      return 'Laps merged successfully'
    }
    case 'getLapDetails': {
      const details = laps.map((lap, i) => {
        const s = lap.stats
        const fields: string[] = [
          `${i + 1}. "${lap.name}" (ID: ${lap.id})`,
          `   Distance: ${formatDistance(s.distance)}`,
          `   Duration: ${formatDuration(s.duration)}`,
          `   Pace: ${formatPace(s.distance, s.duration)}`,
          `   Points: ${lap.pointCount}`,
        ]
        if (s.elevationGain != null)
          fields.push(`   Elevation gain: +${Math.round(s.elevationGain)}m`)
        if (s.elevationLoss != null)
          fields.push(`   Elevation loss: -${Math.round(s.elevationLoss)}m`)
        if (s.avgHr != null) fields.push(`   Avg HR: ${Math.round(s.avgHr)} bpm`)
        if (s.maxHr != null) fields.push(`   Max HR: ${Math.round(s.maxHr)} bpm`)
        if (s.avgCadence != null) fields.push(`   Avg cadence: ${Math.round(s.avgCadence)} spm`)
        if (s.avgPower != null) fields.push(`   Avg power: ${Math.round(s.avgPower)} W`)
        if (s.maxSpeed != null) fields.push(`   Max speed: ${formatSpeed(s.maxSpeed)}`)
        if (s.calories != null) fields.push(`   Calories: ${Math.round(s.calories)} kcal`)
        return fields.join('\n')
      })
      return details.length > 0 ? details.join('\n\n') : 'No laps in this activity.'
    }
    default:
      return `Unknown tool: ${toolName}`
  }
}

/** Generate contextual suggestions based on the current activity state */
function buildSuggestions(laps: LapHandle[], actName: string): string[] {
  const suggestions: string[] = []

  if (laps.length === 1 && laps[0].pointCount > 20) {
    suggestions.push(
      m.chat_suggest_split({
        count: String(Math.min(Math.ceil(laps[0].stats.distance / 1000), 10)),
      }),
    )
  }

  if (laps.length >= 2) {
    suggestions.push(m.chat_suggest_merge())
  }

  // Rename suggestions
  const genericNames = ['lap', 'unnamed', 'track', 'segment']
  const hasGenericName = laps.some((l) =>
    genericNames.some((g) => l.name.toLowerCase().includes(g)),
  )
  if (hasGenericName) {
    suggestions.push(m.chat_suggest_rename_laps())
  }

  if (actName.toLowerCase().includes('activity') || actName.toLowerCase().includes('unnamed')) {
    suggestions.push(m.chat_suggest_rename_activity())
  }

  // Always offer a general one
  if (suggestions.length < 3) {
    suggestions.push(m.chat_suggest_summarize())
  }

  return suggestions.slice(0, 3)
}

export function ActivityChat({
  actDoc,
  revision: _revision,
  laps,
  onClose,
  onRenameActivity,
  onRenameLap,
  onSplitLap,
  onMergeLaps,
}: ActivityChatProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processedToolCalls = useRef(new Set<string>())

  const actDocRef = useRef(actDoc)
  const lapsRef = useRef(laps)
  const callbacksRef = useRef<MutationCallbacks>({
    onRenameActivity,
    onRenameLap,
    onSplitLap,
    onMergeLaps,
  })

  useEffect(() => {
    actDocRef.current = actDoc
    lapsRef.current = laps
    callbacksRef.current = {
      onRenameActivity,
      onRenameLap,
      onSplitLap,
      onMergeLaps,
    }
  }, [actDoc, laps, onRenameActivity, onRenameLap, onSplitLap, onMergeLaps])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({
          activityContext: buildActivityContext(actDocRef.current, lapsRef.current),
        }),
      }),
    [],
  )

  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  // Auto-execute tool calls that don't require approval (only scan last message)
  useEffect(() => {
    const lastMsg = messages.at(-1)
    if (!lastMsg || lastMsg.role !== 'assistant') return

    for (const part of lastMsg.parts) {
      if (!isToolUIPart(part)) continue
      if (part.state !== 'input-available') continue
      if (processedToolCalls.current.has(part.toolCallId)) continue

      const name = getToolName(part)
      const meta = TOOL_META[name]

      // Skip tools that require user approval
      if (meta?.requiresApproval) continue

      processedToolCalls.current.add(part.toolCallId)

      try {
        const result = executeTool(
          name,
          (part as { input: Record<string, unknown> }).input ?? {},
          lapsRef.current,
          callbacksRef.current,
        )

        addToolOutput({
          tool: name,
          toolCallId: part.toolCallId,
          output: result,
        })
      } catch (err) {
        addToolOutput({
          tool: name,
          toolCallId: part.toolCallId,
          state: 'output-error',
          errorText: err instanceof Error ? err.message : 'Operation failed',
        })
      }
    }
  }, [messages, addToolOutput])

  const handleApproveTool = useCallback(
    (toolCallId: string, toolName: string, input: Record<string, unknown>) => {
      if (processedToolCalls.current.has(toolCallId)) return
      processedToolCalls.current.add(toolCallId)

      try {
        const result = executeTool(toolName, input, lapsRef.current, callbacksRef.current)
        addToolOutput({ tool: toolName, toolCallId, output: result })
      } catch (err) {
        addToolOutput({
          tool: toolName,
          toolCallId,
          state: 'output-error',
          errorText: err instanceof Error ? err.message : 'Operation failed',
        })
      }
    },
    [addToolOutput],
  )

  const handleRejectTool = useCallback(
    (toolCallId: string, toolName: string) => {
      if (processedToolCalls.current.has(toolCallId)) return
      processedToolCalls.current.add(toolCallId)

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: m.chat_user_rejected(),
      })
    },
    [addToolOutput],
  )

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [])

  const isLoading = status === 'streaming' || status === 'submitted'

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const text = input.trim()
      if (!text || isLoading) return
      sendMessage({ text })
      setInput('')
    },
    [input, isLoading, sendMessage],
  )

  const handleSuggestion = useCallback(
    (text: string) => {
      if (isLoading) return
      sendMessage({ text })
    },
    [isLoading, sendMessage],
  )

  const suggestions = useMemo(
    () => buildSuggestions(laps, actDoc.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [laps.length, actDoc.name],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center size-6 rounded-lg bg-primary/10">
            <Sparkles className="size-3.5 text-primary" />
            {isLoading && (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary animate-pulse" />
            )}
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight">{m.chat_title()}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyState suggestions={suggestions} onSuggestion={handleSuggestion} />
          ) : (
            messages.map((message, idx) => (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={isLoading}
                isLast={idx === messages.length - 1}
                laps={laps}
                onApproveTool={handleApproveTool}
                onRejectTool={handleRejectTool}
              />
            ))
          )}

          {isLoading && messages.at(-1)?.role !== 'assistant' && <ThinkingIndicator />}

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-xs">
              <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
              <span className="text-destructive/90">
                {error.message || m.chat_error_fallback()}
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border/60 bg-card/30">
        <form onSubmit={handleSubmit} className="px-3 py-2.5">
          <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
            <textarea
              ref={inputRef}
              className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/40 outline-none min-h-[24px] max-h-[120px] py-0.5 leading-relaxed"
              placeholder={m.chat_placeholder()}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              disabled={isLoading}
              rows={1}
            />
            <Button
              type="submit"
              size="icon-xs"
              variant={input.trim() ? 'default' : 'ghost'}
              disabled={!input.trim() || isLoading}
              className="shrink-0 transition-all"
            >
              {isLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Send className="size-3" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 text-center mt-1.5 select-none">
            {m.chat_undo_hint()} <kbd className="font-mono text-muted-foreground/50">Ctrl+Z</kbd>
          </p>
        </form>
      </div>
    </div>
  )
}

/* ── Empty State ── */

function EmptyState({
  suggestions,
  onSuggestion,
}: {
  suggestions: string[]
  onSuggestion: (text: string) => void
}) {
  return (
    <div className="flex flex-col items-center text-center pt-6 pb-2">
      {/* Decorative topo-style rings */}
      <div className="relative mb-5">
        <div className="absolute inset-0 -m-6 rounded-full border border-primary/[0.06]" />
        <div className="absolute inset-0 -m-10 rounded-full border border-primary/[0.04]" />
        <div className="absolute inset-0 -m-14 rounded-full border border-primary/[0.02]" />
        <div className="relative flex items-center justify-center size-12 rounded-2xl bg-primary/8 border border-primary/10">
          <MapPin className="size-5 text-primary/70" strokeWidth={1.5} />
        </div>
      </div>

      <h3 className="font-serif text-lg text-foreground/90 mb-1">{m.chat_title()}</h3>
      <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[220px] mb-5">
        {m.chat_empty_desc()}
      </p>

      {/* Suggestion chips */}
      <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestion(suggestion)}
            className="group flex items-center gap-2.5 w-full rounded-lg border border-border/50 bg-card/60 hover:bg-accent/60 hover:border-primary/20 px-3 py-2 text-left transition-all"
          >
            <Sparkles className="size-3 text-muted-foreground/40 group-hover:text-primary/60 transition-colors shrink-0" />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">
              {suggestion}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Thinking Indicator ── */

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex items-center justify-center size-6 rounded-lg bg-primary/10 shrink-0 mt-0.5">
        <Sparkles className="size-3 text-primary/60" />
      </div>
      <div className="flex items-center gap-1.5 rounded-xl bg-muted/40 border border-border/40 px-3.5 py-2.5">
        <div className="flex gap-1">
          <span className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:0ms]" />
          <span className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:150ms]" />
          <span className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

/* ── Tool Execution Pill (completed / auto-approved / in-progress) ── */

function ToolPill({ name, state }: { name: string; state: string }) {
  const meta = TOOL_META[name] ?? { label: name, icon: Sparkles, requiresApproval: false }
  const Icon = meta.icon
  const done = state === 'output-available'
  const errored = state === 'output-error'

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
        errored
          ? 'bg-destructive/8 text-destructive/80 border border-destructive/15'
          : done
            ? 'bg-forest/8 text-forest border border-forest/15'
            : 'bg-primary/6 text-primary/70 border border-primary/10'
      }`}
    >
      {errored ? (
        <AlertCircle className="size-3" />
      ) : done ? (
        <Check className="size-3" />
      ) : (
        <Loader2 className="size-3 animate-spin" />
      )}
      <Icon className="size-3 opacity-60" />
      <span>{meta.label}</span>
    </div>
  )
}

/* ── Tool Approval Card (requires user confirmation) ── */

function ToolApprovalCard({
  name,
  input,
  laps,
  onApprove,
  onReject,
}: {
  name: string
  input: Record<string, unknown>
  laps: LapHandle[]
  onApprove: () => void
  onReject: () => void
}) {
  const meta = TOOL_META[name] ?? { label: name, icon: Sparkles, requiresApproval: true }
  const Icon = meta.icon
  const description = describeToolCall(name, input, laps)

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/[0.03] px-3.5 py-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center size-5 rounded-md bg-primary/10">
          <Icon className="size-3 text-primary/70" />
        </div>
        <span className="text-xs font-medium text-foreground/80">{description}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="xs" onClick={onApprove} className="gap-1.5">
          <Check className="size-3" />
          {m.chat_accept()}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={onReject}
          className="gap-1.5 text-muted-foreground"
        >
          <Ban className="size-3" />
          {m.chat_reject()}
        </Button>
      </div>
    </div>
  )
}

/* ── Chat Message ── */

function ChatMessage({
  message,
  isStreaming,
  isLast,
  laps,
  onApproveTool,
  onRejectTool,
}: {
  message: UIMessage
  isStreaming: boolean
  isLast: boolean
  laps: LapHandle[]
  onApproveTool: (toolCallId: string, toolName: string, input: Record<string, unknown>) => void
  onRejectTool: (toolCallId: string, toolName: string) => void
}) {
  const isUser = message.role === 'user'
  const showStreamingCursor = !isUser && isStreaming && isLast

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2.5">
          {message.parts.map((part, i) => {
            if (part.type === 'text') {
              return (
                <span key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
                  {part.text}
                </span>
              )
            }
            return null
          })}
        </div>
      </div>
    )
  }

  // Collect pending approval tool calls for batch UI
  const pendingApprovals: {
    index: number
    toolCallId: string
    name: string
    input: Record<string, unknown>
  }[] = []
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]
    if (!isToolUIPart(part)) continue
    const name = getToolName(part)
    const meta = TOOL_META[name]
    if (meta?.requiresApproval && part.state === 'input-available') {
      pendingApprovals.push({
        index: i,
        toolCallId: part.toolCallId,
        name,
        input: (part as { input?: Record<string, unknown> }).input ?? {},
      })
    }
  }
  const showBatch = pendingApprovals.length > 1

  // Assistant message
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex items-center justify-center size-6 rounded-lg bg-primary/10 shrink-0 mt-0.5">
        <Sparkles className="size-3 text-primary/60" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {message.parts.map((part, i) => {
          if (part.type === 'text' && part.text) {
            return (
              <div
                key={i}
                className="rounded-2xl rounded-tl-md bg-muted/40 border border-border/40 px-3.5 py-2.5"
              >
                <span className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {part.text}
                </span>
                {showStreamingCursor && i === message.parts.length - 1 && (
                  <span className="inline-block w-0.5 h-4 ml-0.5 -mb-0.5 bg-primary/50 animate-pulse rounded-full" />
                )}
              </div>
            )
          }
          if (isToolUIPart(part)) {
            const name = getToolName(part)
            const meta = TOOL_META[name]
            const input = (part as { input?: Record<string, unknown> }).input ?? {}

            // Pending approval: single → card with buttons; batch → handled below
            if (meta?.requiresApproval && part.state === 'input-available') {
              if (showBatch) return null // rendered in batch block below
              return (
                <ToolApprovalCard
                  key={i}
                  name={name}
                  input={input}
                  laps={laps}
                  onApprove={() => onApproveTool(part.toolCallId, name, input)}
                  onReject={() => onRejectTool(part.toolCallId, name)}
                />
              )
            }

            return <ToolPill key={i} name={name} state={part.state} />
          }
          return null
        })}

        {/* Batch approval card for multiple pending tools */}
        {showBatch && (
          <div className="rounded-xl border border-primary/15 bg-primary/[0.03] px-3.5 py-3 space-y-2.5">
            <div className="space-y-1">
              {pendingApprovals.map((t) => {
                const meta = TOOL_META[t.name] ?? {
                  label: t.name,
                  icon: Sparkles,
                  requiresApproval: true,
                }
                const Icon = meta.icon
                return (
                  <div
                    key={t.toolCallId}
                    className="flex items-center gap-2 text-xs text-foreground/70"
                  >
                    <Icon className="size-3 text-primary/50 shrink-0" />
                    <span className="truncate">{describeToolCall(t.name, t.input, laps)}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                onClick={() => {
                  for (const t of pendingApprovals) {
                    onApproveTool(t.toolCallId, t.name, t.input)
                  }
                }}
                className="gap-1.5"
              >
                <Check className="size-3" />
                {m.chat_accept_all({ count: String(pendingApprovals.length) })}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  for (const t of pendingApprovals) {
                    onRejectTool(t.toolCallId, t.name)
                  }
                }}
                className="gap-1.5 text-muted-foreground"
              >
                <Ban className="size-3" />
                {m.chat_reject_all()}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
