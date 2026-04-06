import { createFileRoute } from '@tanstack/react-router'
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { activityTools } from '~/lib/tools/activity-tools'
import { fetchAuthQuery, fetchAuthMutation } from '~/lib/auth-server'
import { logger } from '~/utils/logger'
import { reportError, toError } from '~/utils/error-reporter'
import { api } from '../../../convex/_generated/api'

// ---------------------------------------------------------------------------
// Tool credit costs (from design doc)
// ---------------------------------------------------------------------------

const TOOL_COSTS: Record<string, number> = {
  getLapDetails: 0,
  getColumns: 0,
  renameActivity: 1,
  renameLap: 1,
  deleteLap: 1,
  splitLap: 2,
  mergeLaps: 2,
  toggleBuiltinColumn: 1,
  addCustomColumn: 1,
  removeCustomColumn: 1,
  setCustomColumnValue: 1,
}

const BASE_MESSAGE_COST = 1

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now()

        try {
          // 1. Check credits
          const balance = await fetchAuthQuery(api.credits.getBalance)
          if (!balance) {
            return Response.json({ error: 'Not authenticated' }, { status: 401 })
          }
          if (balance.total <= 0) {
            return Response.json({ error: 'No credits remaining' }, { status: 403 })
          }

          const { messages, activityContext } = await request.json()
          const systemPrompt = buildSystemPrompt(activityContext)

          logger.info('Chat request started', {
            lapCount: activityContext?.laps?.length,
            messageCount: messages?.length,
          })

          // 2. Stream the response, deduct credits when done
          const result = streamText({
            model: openai('gpt-5.4-mini'),
            system: systemPrompt,
            messages: await convertToModelMessages(messages),
            tools: activityTools,
            stopWhen: stepCountIs(10),
            onFinish: async ({ toolCalls }) => {
              let cost = BASE_MESSAGE_COST
              for (const tc of toolCalls) {
                cost += TOOL_COSTS[tc.toolName] ?? 1
              }

              const toolSummary =
                toolCalls.length > 0 ? ` + ${toolCalls.map((tc) => tc.toolName).join(', ')}` : ''

              logger.info('Chat stream completed', {
                durationMs: Date.now() - startTime,
                toolCalls: toolCalls.map((tc) => tc.toolName),
                creditCost: cost,
              })

              try {
                await fetchAuthMutation(api.credits.deductMyCredits, {
                  amount: cost,
                  metadata: `chat turn${toolSummary}`,
                })
              } catch (err) {
                reportError(toError(err), { context: 'credit-deduction' })
              }
            },
          })

          return result.toUIMessageStreamResponse()
        } catch (err) {
          const duration = Date.now() - startTime

          reportError(toError(err), { context: 'chat-api', durationMs: duration })

          return Response.json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})

interface LapContext {
  id: string
  name: string
  distance: string
  duration: string
  elevationGain?: number
  pointCount: number
}

interface BuiltinColumnCtx {
  key: string
  label: string
  visible: boolean
}

interface CustomColumnCtx {
  name: string
  type: 'manual' | 'computed'
  formula?: string
}

interface ActivityContext {
  name: string
  format: 'gpx' | 'tcx'
  laps: LapContext[]
  columns?: {
    builtin: BuiltinColumnCtx[]
    custom: CustomColumnCtx[]
  }
}

function buildSystemPrompt(ctx: ActivityContext): string {
  const lapList = ctx.laps
    .map(
      (lap, i) =>
        `${i + 1}. "${lap.name}" (ID: ${lap.id}) — ${lap.distance}, ${lap.duration}, ${lap.pointCount} pts${lap.elevationGain ? `, +${Math.round(lap.elevationGain)}m` : ''}`,
    )
    .join('\n')

  let columnSection = ''
  if (ctx.columns) {
    const builtinList = ctx.columns.builtin
      .map((c) => `  ${c.visible ? '✓' : '✗'} ${c.label} (key: ${c.key})`)
      .join('\n')
    const customList =
      ctx.columns.custom.length > 0
        ? ctx.columns.custom
            .map((c) => `  • "${c.name}" (${c.type}${c.formula ? `, formula: ${c.formula}` : ''})`)
            .join('\n')
        : '  (none)'
    columnSection = `

## Columns
Built-in (✓ = visible, ✗ = hidden):
${builtinList}

Custom columns on this activity:
${customList}`
  }

  return `You are Trail Companion, the AI assistant built into Lapcraft. Help users modify their fitness activities through natural language.

## Current Activity
- Name: ${ctx.name}
- Format: ${ctx.format.toUpperCase()}

## Laps (${ctx.laps.length} total)
${lapList || '(no laps)'}${columnSection}

## Guidelines
- Use the exact lap IDs shown above when calling tools.
- You can call multiple tools in one response if the user requests multiple changes.
- After changes, briefly confirm what you did.
- Keep responses concise and friendly.
- If the request is ambiguous, map the user's description to the correct lap ID from the list above.
- All changes can be undone with Ctrl+Z.
- You cannot delete or reorder laps. All operations preserve every trackpoint — laps are just organizational boundaries over the same GPS data.
- When splitting, the number of parts must be between 2 and 20.
- When merging, the two laps must be adjacent (consecutive in the list).
- Use getLapDetails to fetch full statistics (pace, HR, cadence, power, calories, elevation gain/loss, max speed) before answering analytical questions like "which lap was fastest" or "compare my laps". The lap list above only has basic info.

## Column Management
- Use getColumns to inspect the current column setup before making changes.
- toggleBuiltinColumn shows/hides built-in columns using the key (e.g. "avgHr", "calories").
- addCustomColumn creates a manual column (user-entered values) or a computed column (formula with two operands).
  - For computed columns, operands can be built-in stat keys (distance, duration, avgHr, maxHr, avgCadence, avgPower, maxSpeed, calories, elevationGain, elevationLoss) or names of existing manual custom columns.
  - Operators: divide (A/B), divideby (B/A), multiply (A×B), add (A+B), subtract (A−B).
- removeCustomColumn unlinks a custom column from this activity (does not delete it permanently).
- setCustomColumnValue sets a numeric value for a manual custom column on a specific lap.`
}
