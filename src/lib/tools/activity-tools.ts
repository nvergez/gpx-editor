import { tool } from 'ai'
import { z } from 'zod'

export const activityTools = {
  renameActivity: tool({
    description: 'Rename the activity. Use when the user wants to change the activity name.',
    inputSchema: z.object({
      name: z.string().describe('The new name for the activity'),
    }),
  }),

  renameLap: tool({
    description:
      'Rename a specific lap. Use the lap ID from the activity context to identify the lap.',
    inputSchema: z.object({
      lapId: z.string().describe('The ID of the lap to rename'),
      name: z.string().describe('The new name for the lap'),
    }),
  }),

  deleteLap: tool({
    description:
      'Delete a lap from the activity. The user can undo this with Ctrl+Z. Use the lap ID from the activity context.',
    inputSchema: z.object({
      lapId: z.string().describe('The ID of the lap to delete'),
    }),
  }),

  splitLap: tool({
    description:
      'Split a lap into multiple equal parts by distributing trackpoints evenly. The resulting laps will be numbered sequentially.',
    inputSchema: z.object({
      lapId: z.string().describe('The ID of the lap to split'),
      parts: z.number().int().min(2).max(20).describe('Number of equal parts to split into (2-20)'),
    }),
  }),

  mergeLaps: tool({
    description:
      'Merge two consecutive laps into one. The laps must be adjacent in the activity. The merged lap name combines both original names.',
    inputSchema: z.object({
      lapId1: z.string().describe('The ID of the first lap'),
      lapId2: z.string().describe('The ID of the second (adjacent) lap'),
    }),
  }),

  getLapDetails: tool({
    description:
      'Get detailed statistics for all laps. Returns full data including pace, heart rate, cadence, power, speed, calories, elevation gain/loss, and point count. Use this when the user asks analytical questions like "which lap was fastest", "compare my laps", or "summarize my stats".',
    inputSchema: z.object({}),
  }),
}
