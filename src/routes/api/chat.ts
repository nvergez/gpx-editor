import { createFileRoute } from '@tanstack/react-router'
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { activityTools } from '~/lib/tools/activity-tools'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, activityContext } = await request.json()
        const systemPrompt = buildSystemPrompt(activityContext)

        const result = streamText({
          model: openai('gpt-5.4-mini'),
          system: systemPrompt,
          messages: await convertToModelMessages(messages),
          tools: activityTools,
          stopWhen: stepCountIs(10),
        })

        return result.toUIMessageStreamResponse()
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

interface ActivityContext {
  name: string
  format: 'gpx' | 'tcx'
  laps: LapContext[]
}

function buildSystemPrompt(ctx: ActivityContext): string {
  const lapList = ctx.laps
    .map(
      (lap, i) =>
        `${i + 1}. "${lap.name}" (ID: ${lap.id}) — ${lap.distance}, ${lap.duration}, ${lap.pointCount} pts${lap.elevationGain ? `, +${Math.round(lap.elevationGain)}m` : ''}`,
    )
    .join('\n')

  return `You are an AI assistant integrated into a GPX/TCX activity editor. Help users modify their fitness activities through natural language.

## Current Activity
- Name: ${ctx.name}
- Format: ${ctx.format.toUpperCase()}

## Laps (${ctx.laps.length} total)
${lapList || '(no laps)'}

## Guidelines
- Use the exact lap IDs shown above when calling tools.
- You can call multiple tools in one response if the user requests multiple changes.
- After changes, briefly confirm what you did.
- Keep responses concise and friendly.
- If the request is ambiguous (e.g. "delete the third lap" when IDs are needed), map the user's description to the correct lap ID from the list above.
- All changes can be undone with Ctrl+Z.
- When splitting, the number of parts must be between 2 and 20.
- When merging, the two laps must be adjacent (consecutive in the list).
- Use getLapDetails to fetch full statistics (pace, HR, cadence, power, calories, elevation gain/loss, max speed) before answering analytical questions like "which lap was fastest" or "compare my laps". The lap list above only has basic info.`
}
