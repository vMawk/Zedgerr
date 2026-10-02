// Stub: AI grammar improvement falls back to returning the original text.
// Set OPENAI_API_KEY + OPENAI_BASE_URL env vars for a compatible LLM backend.

interface AiMessage {
  role: string;
  content: string;
}

interface AiInput {
  messages?: AiMessage[];
  prompt?: string;
}

interface AiResult {
  response: string;
}

export class NodeAiAdapter {
  async run(_model: string, input: AiInput): Promise<AiResult> {
    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiBase = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    if (openaiKey) {
      try {
        const messages = input.messages ?? [{ role: "user", content: input.prompt ?? "" }];
        const resp = await fetch(`${openaiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({ model: openaiModel, messages }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
          return { response: data.choices[0]?.message?.content ?? "" };
        }
      } catch {
        // fall through to stub
      }
    }

    // No AI configured: return the user message unchanged
    const userMsg = input.messages?.find((m) => m.role === "user")?.content ?? input.prompt ?? "";
    return { response: userMsg };
  }
}
