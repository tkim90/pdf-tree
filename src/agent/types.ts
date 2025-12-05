import { z } from "zod"

export const FinishReasonSchema = z.enum(["stop", "tool_calls", "length"])

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
})

export type ToolCall = z.infer<typeof ToolCallSchema>

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>
    required?: string[]
  }
}

export interface Tool {
  definition: ToolDefinition
  execute: (args: Record<string, unknown>) => Promise<string>
}
