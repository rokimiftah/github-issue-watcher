// convex/sendamatic/SendamaticClient.ts

interface SendamaticEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

interface SendamaticResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class SendamaticClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://send.api.sendamatic.net/send") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async sendEmail(options: SendamaticEmailOptions): Promise<SendamaticResponse> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: Array.isArray(options.to) ? options.to : [options.to],
          sender: options.from,
          subject: options.subject,
          html_body: options.html,
          text_body: options.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Sendamatic API error: ${response.status} ${response.statusText} - ${errorData.message || "Unknown error"}`,
        );
      }

      const result = await response.json();
      return {
        success: true,
        messageId: result.id || result.messageId,
      };
    } catch (error) {
      console.error("Sendamatic sendEmail error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}

export function createSendamaticClient(): SendamaticClient {
  const user = process.env.SENDAMATIC_USER;
  const pass = process.env.SENDAMATIC_PASS;

  if (!user || !pass) {
    throw new Error("SENDAMATIC_USER and SENDAMATIC_PASS environment variables are required");
  }

  const apiKey = `${user}-${pass}`;
  return new SendamaticClient(apiKey);
}
