import { z } from "zod"
import { FinishReasonSchema, ToolCallSchema } from "./types"

export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  error: z.string().optional(),
  model: z.string().optional(),
  finishReason: FinishReasonSchema.optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolCallId: z.string().optional(),
})

export type Message = z.infer<typeof MessageSchema>

export function createMessage(params: {
  role: Message["role"]
  content: string
  error?: string
  model?: string
  finishReason?: Message["finishReason"]
  toolCalls?: Message["toolCalls"]
  toolCallId?: string
}): Message {
  return MessageSchema.parse({
    id: `msg-${Date.now()}`,
    ...params,
  })
}
