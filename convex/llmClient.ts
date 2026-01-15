// convex/llmClient.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import { ConvexError } from "convex/values";
import OpenAI from "openai";

const LLM_API_URL = process.env.LLM_API_URL || "https://apis.iflow.cn/v1";
const LLM_MODEL = process.env.LLM_MODEL || "qwen3-max";

// Custom error for rate limiting
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

function getOpenAIClient(apiKey: string): OpenAI {
  if (!apiKey) {
    throw new ConvexError("LLM_API_KEY is not set");
  }
  return new OpenAI({
    apiKey: apiKey,
    baseURL: LLM_API_URL,
  });
}

function stripFences(s: string) {
  return s
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}
function endWithPeriod(s: string) {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
function enforceNonMultipleOfFive(n: number, salt: number) {
  if (!Number.isFinite(n)) return 0;
  const c = Math.max(0, Math.min(100, Math.round(n)));
  if (c === 0 || c === 100) return c;
  if (c % 5 !== 0) return c;
  return salt % 2 === 0 ? Math.min(100, c + 1) : Math.max(0, c - 1);
}

export type AnalysisResult = {
  relevanceScore: number;
  explanation: string;
  matchedTerms?: string[];
  evidence?: string[];
};

export async function analyzeIssueOpenAIStyle(opts: {
  keyword: string;
  issue: {
    id: string;
    number: number;
    title: string;
    body: string;
    labels: string[];
    createdAt: string;
  };
  maxTokens?: number;
  apiKey: string;
}): Promise<AnalysisResult> {
  const { keyword, issue, maxTokens = 260, apiKey } = opts;

  const systemPrompt = "You are a helpful assistant capable of complex reasoning. Always think step-by-step before answering.";

  const userPrompt = `
You are ranking GitHub issues for relevance to the keyword: "${keyword}".

Rules:
- Consider TITLE (0.45), BODY (0.35), LABELS (0.20).
- Accept synonyms/aliases of the keyword.
- Prefer concrete evidence (error messages, API names).
- EXPLANATION: 1-2 sentences (220 chars), mention where match was found.
- CRITICAL: You MUST respond with valid JSON only, no markdown formatting, no explanations outside the JSON.

Respond ONLY with this exact JSON format:
{"relevanceScore": <0-100 integer not a multiple of 5>, "explanation": "<1-2 sentences, 80-220 chars>", "matchedTerms": ["..."], "evidence": ["<short excerpt or reason>"]}

Issue:
TITLE: ${issue.title}
LABELS: ${issue.labels.join(", ") || "none"}
BODY:
${(issue.body || "").slice(0, 3000)}
`.trim();

  let full = "";
  try {
    const openai = getOpenAIClient(apiKey);
    const resp: any = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: Math.max(maxTokens, 800),
      stream: false,
    });

    console.log("[GIW][LLM] Raw response:", JSON.stringify(resp, null, 2));

    // Check for rate limit error (iFlow returns status 449)
    if (resp?.status === "449" || resp?.msg?.includes("rate limit")) {
      console.warn("[GIW][LLM] Rate limit hit from iFlow");
      throw new RateLimitError("iFlow rate limit exceeded");
    }

    const m: any = resp?.choices?.[0]?.message;
    console.log("[GIW][LLM] Message object:", JSON.stringify(m, null, 2));

    full = m?.content ?? m?.reasoning_content ?? "";

    console.log("[GIW][LLM] Extracted content:", full);

    if (!full) {
      // Check if this is actually a rate limit response
      if (resp?.status === "449" || resp?.msg?.includes("rate limit")) {
        throw new RateLimitError("iFlow rate limit exceeded");
      }
      console.error("[GIW][LLM] Empty content detected. Full response structure:", resp);
      throw new ConvexError("Empty LLM response");
    }

    const clean = stripFences(full);
    const parsed: any = JSON.parse(clean);

    const scoreRaw = Number(parsed.relevanceScore ?? 0);
    const score = enforceNonMultipleOfFive(scoreRaw, issue.number);
    const explanation = endWithPeriod(String(parsed.explanation ?? "").slice(0, 260));
    const matchedTerms = Array.isArray(parsed.matchedTerms) ? parsed.matchedTerms.slice(0, 6) : [];
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 4) : [];

    return { relevanceScore: score, explanation, matchedTerms, evidence };
  } catch (err: any) {
    throw new ConvexError(err?.message ?? "LLM call failed");
  }
}
