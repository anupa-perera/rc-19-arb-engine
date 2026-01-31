const API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_URL = "http://localhost:3000";
const SITE_NAME = "RC-19 Arb Engine";

if (!API_KEY) {
  console.warn(
    "[INFRA] [AGENT] OPENROUTER_API_KEY is missing. Agent features will be disabled.",
  );
}

// Define minimal types to match what's needed
export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatCompletionMessage[];
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    message: ChatCompletionMessage;
  }[];
}

class OpenRouterClient {
  private apiKey: string | undefined;
  private headers: HeadersInit;

  constructor(options: { apiKey: string | undefined }) {
    this.apiKey = options.apiKey;
    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME,
      "Content-Type": "application/json",
    };
  }

  public chat = {
    completions: {
      create: async (
        options: ChatCompletionOptions,
      ): Promise<ChatCompletionResponse> => {
        if (!this.apiKey) {
          throw new Error("OpenRouter API Key is missing");
        }

        try {
          const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: this.headers,
              body: JSON.stringify(options),
            },
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `OpenRouter API Error: ${response.status} ${response.statusText} - ${errorText}`,
            );
          }

          return (await response.json()) as ChatCompletionResponse;
        } catch (error) {
          console.error("[INFRA] [AGENT] Chat completion failed", error);
          throw error;
        }
      },
    },
  };
}

export const agentClient = new OpenRouterClient({
  apiKey: API_KEY,
});
