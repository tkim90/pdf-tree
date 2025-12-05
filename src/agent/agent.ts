import OpenAI from "openai"
import SYSTEM_PROMPT from "../prompts/system/default.txt"
import { type Message, createMessage } from "./message"
import type { Tool, ToolCall } from "./types"
import { defaultTools } from "./tools"

const TOOL_TIMEOUT_MS = 30_000
const DOOM_LOOP_THRESHOLD = 3

export interface AgentConfig {
  model?: string
  systemPrompt?: string
  tools?: Tool[]
}

export class Agent {
  private client: OpenAI
  private model: string
  private systemPrompt: string
  private tools: Tool[]
  private toolMap: Map<string, Tool>

  constructor(config: AgentConfig = {}) {
    this.client = new OpenAI()
    this.model = config.model ?? "gpt-4.1"
    this.systemPrompt = config.systemPrompt ?? SYSTEM_PROMPT
    this.tools = config.tools ?? defaultTools
    this.toolMap = new Map(this.tools.map((t) => [t.definition.name, t]))
  }

  private getOpenAITools(): OpenAI.ChatCompletionTool[] | undefined {
    if (this.tools.length === 0) return undefined
    return this.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      },
    }))
  }

  private async executeTool(toolCall: ToolCall): Promise<string> {
    const tool = this.toolMap.get(toolCall.name)
    if (!tool) {
      return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` })
    }
    try {
      const result = await Promise.race([
        tool.execute(toolCall.arguments),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tool execution timeout")), TOOL_TIMEOUT_MS)
        ),
      ])
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return JSON.stringify({ error: errorMessage, tool: toolCall.name })
    }
  }

  private buildMessages(
    history: Message[]
  ): OpenAI.ChatCompletionMessageParam[] {
    const systemMessage: OpenAI.ChatCompletionMessageParam = {
      role: "system",
      content: this.systemPrompt,
    }

    const historyMessages = history.map((msg): OpenAI.ChatCompletionMessageParam => {
      if (msg.role === "tool" && msg.toolCallId) {
        return {
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        }
      }

      if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        }
      }

      return {
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }
    })

    return [systemMessage, ...historyMessages]
  }

  getModel(): string {
    return this.model
  }

  async *streamResponse(
    history: Message[]
  ): AsyncGenerator<{
    type: "text" | "tool_call" | "tool_result"
    content: string
    message?: Message
  }> {
    const workingHistory: Message[] = [...history]
    const recentToolCalls: { name: string; args: string }[] = []

    while (true) {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: this.buildMessages(workingHistory),
        tools: this.getOpenAITools(),
        stream: true,
      })

      let content = ""
      let finishReason = ""
      const toolCallBuffers: Map<number, { id: string; name: string; args: string }> =
        new Map()

      for await (const chunk of stream) {
        const choice = chunk.choices[0]

        if (choice?.delta?.content) {
          const text = choice.delta.content
          content += text
          yield { type: "text", content: text }
        }

        if (choice?.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const existing = toolCallBuffers.get(tc.index) ?? {
              id: "",
              name: "",
              args: "",
            }
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name = tc.function.name
            if (tc.function?.arguments) existing.args += tc.function.arguments
            toolCallBuffers.set(tc.index, existing)
          }
        }

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason
        }
      }

      if (finishReason === "tool_calls") {
        const toolCalls: ToolCall[] = []
        for (const [_, buffer] of toolCallBuffers) {
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = JSON.parse(buffer.args)
          } catch {
            parsedArgs = { _parseError: buffer.args }
          }
          toolCalls.push({
            id: buffer.id,
            name: buffer.name,
            arguments: parsedArgs,
          })
        }

        // Doom loop detection
        for (const toolCall of toolCalls) {
          const callSignature = { name: toolCall.name, args: JSON.stringify(toolCall.arguments) }
          recentToolCalls.push(callSignature)

          const lastN = recentToolCalls.slice(-DOOM_LOOP_THRESHOLD)
          if (
            lastN.length === DOOM_LOOP_THRESHOLD &&
            lastN.every(c => c.name === callSignature.name && c.args === callSignature.args)
          ) {
            yield { type: "text", content: "\n[Detected repeated tool calls - generating response...]\n" }
            
            const finalMessages = [
              ...this.buildMessages(workingHistory),
              { role: "user" as const, content: "You seem to be stuck in a loop. Please provide your answer now based on what you've found so far." }
            ]

            const finalStream = await this.client.chat.completions.create({
              model: this.model,
              messages: finalMessages,
              stream: true,
            })

            for await (const chunk of finalStream) {
              const choice = chunk.choices[0]
              if (choice?.delta?.content) {
                yield { type: "text", content: choice.delta.content }
              }
            }
            return
          }
        }

        const toolCallMessage = createMessage({
          role: "assistant",
          content: content || "",
          model: this.model,
          finishReason: "tool_calls",
          toolCalls,
        })

        yield {
          type: "tool_call",
          content: `[Calling ${toolCalls.map((tc) => tc.name).join(", ")}...]`,
          message: toolCallMessage,
        }

        workingHistory.push(toolCallMessage)

        for (const toolCall of toolCalls) {
          const result = await this.executeTool(toolCall)

          const toolResultMessage = createMessage({
            role: "tool",
            content: result,
            toolCallId: toolCall.id,
          })

          yield {
            type: "tool_result",
            content: `[${toolCall.name} result received]`,
            message: toolResultMessage,
          }

          workingHistory.push(toolResultMessage)
        }

        continue
      }

      workingHistory.push(
        createMessage({
          role: "assistant",
          content,
          model: this.model,
          finishReason: finishReason as Message["finishReason"],
        })
      )

      if (finishReason === "stop") {
        return
      }

      if (finishReason === "length") {
        continue
      }

      return
    }
  }
}
