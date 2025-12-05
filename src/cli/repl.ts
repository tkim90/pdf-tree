import * as readline from "readline"
import { Agent } from "../agent/agent"
import { type Message, createMessage } from "../agent/message"

export async function startREPL(): Promise<void> {
  const agent = new Agent()
  const history: Message[] = []

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  rl.on("close", () => {
    console.log("\nGoodbye!")
    process.exit(0)
  })

  console.log("PDF Retriever Agent ready. Commands: /quit, /debug, /clear\n")

  const prompt = (): void => {
    rl.question("You: ", async (input) => {
      const trimmedInput = input.trim()

      if (trimmedInput === "/quit") {
        console.log("Goodbye!")
        rl.close()
        return
      }

      if (trimmedInput === "/debug") {
        console.log("\n=== Chat History Debug ===")
        if (history.length === 0) {
          console.log("(empty)")
        } else {
          for (const msg of history) {
            const displayMsg = { ...msg }
            if (msg.role === "tool" && msg.content) {
              try {
                displayMsg.content = JSON.parse(msg.content)
              } catch {
                // keep as string if not valid JSON
              }
            }
            console.log(JSON.stringify(displayMsg, null, 2))
            console.log("---")
          }
        }
        console.log("")
        prompt()
        return
      }

      if (trimmedInput === "/clear") {
        history.length = 0
        console.log("Chat history cleared.\n")
        prompt()
        return
      }

      if (!trimmedInput) {
        prompt()
        return
      }

      const userMessage = createMessage({
        role: "user",
        content: trimmedInput,
        model: agent.getModel(),
      })
      history.push(userMessage)

      process.stdout.write("Agent: ")

      let assistantContent = ""

      try {
        for await (const chunk of agent.streamResponse(history)) {
          if (chunk.type === "text") {
            process.stdout.write(chunk.content)
            assistantContent += chunk.content
          } else if (chunk.type === "tool_call") {
            process.stdout.write(`\n${chunk.content}`)
            if (chunk.message) {
              history.push(chunk.message)
            }
          } else if (chunk.type === "tool_result") {
            process.stdout.write(`${chunk.content}\n`)
            if (chunk.message) {
              history.push(chunk.message)
            }
          }
        }

        if (assistantContent) {
          const assistantMessage = createMessage({
            role: "assistant",
            content: assistantContent,
            finishReason: "stop",
            model: agent.getModel(),
          })
          history.push(assistantMessage)
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error"
        console.error(`\nError: ${errorMessage}`)

        const errorMsg = createMessage({
          role: "assistant",
          content: "",
          error: errorMessage,
          model: agent.getModel(),
        })
        history.push(errorMsg)
      }

      console.log("\n")
      prompt()
    })
  }

  prompt()
}
