// convex/iflow.ts

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";

// --- INTERNAL QUERY & MUTATION (Database Access) ---

export const getStoredKey = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "IFLOW_API_KEY"))
      .first();
  },
});

export const saveNewKey = internalMutation({
  args: { apiKey: v.string(), expireTime: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "IFLOW_API_KEY"))
      .first();

    const data = {
      key: "IFLOW_API_KEY",
      value: args.apiKey,
      expireTime: args.expireTime,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("appSettings", data);
    }
  },
});

// --- HELPER FUNCTIONS ---

function getXsrfToken(cookieString: string): string | null {
  const match = cookieString.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// --- MAIN ACTION (Fetch to External API) ---

export const refreshApiKey = action({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    console.log("[iFlow] Checking API Key status...");

    const cookie = process.env.IFLOW_COOKIE;
    const name = process.env.IFLOW_NAME;

    if (!cookie || !name) {
      throw new Error("ENV 'IFLOW_COOKIE' or 'IFLOW_NAME' not set in Dashboard!");
    }

    const currentData: { value: string; expireTime: string } | null = await ctx.runQuery(internal.iflow.getStoredKey);
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    let shouldRefresh = false;

    if (!currentData) {
      console.log("[iFlow] No stored key. Initializing...");
      shouldRefresh = true;
    } else {
      const expireDate = new Date(currentData.expireTime).getTime();
      if (now >= expireDate - ONE_DAY) {
        console.log(`[iFlow] Key expires soon (${currentData.expireTime}). Refreshing...`);
        shouldRefresh = true;
      } else {
        console.log(`[iFlow] Key still valid. Expires: ${currentData.expireTime}`);
        return currentData.value;
      }
    }

    if (shouldRefresh) {
      const xsrfToken = getXsrfToken(cookie);
      if (!xsrfToken) throw new Error("XSRF-TOKEN not found in Cookie ENV");

      console.log("[iFlow] Calling iFlow API for key refresh...");

      const response = await fetch("https://iflow.cn/api/openapi/apikey", {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
          Referer: "https://iflow.cn/?open=setting",
          "Content-Type": "application/json",
          Cookie: cookie,
          "x-xsrf-token": xsrfToken,
          "bx-v": "2.5.36",
        },
        body: JSON.stringify({ name: name }),
      });

      if (!response.ok) {
        const errTxt = await response.text();
        throw new Error(`iFlow Fetch Error: ${errTxt}`);
      }

      const body = await response.json();

      if (body.data?.apiKeyMask) {
        const newKey = body.data.apiKeyMask;
        const newExpire = body.data.expireTime.replace(" ", "T");

        await ctx.runMutation(internal.iflow.saveNewKey, {
          apiKey: newKey,
          expireTime: newExpire,
        });

        console.log("[iFlow] SUCCESS! New key saved to database.");
        return newKey;
      } else {
        throw new Error("Response valid but no apiKeyMask found");
      }
    }

    return null;
  },
});

// --- QUERY: Get current API key (for use by other modules) ---

export const getApiKey = internalQuery({
  handler: async (ctx) => {
    const stored = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "IFLOW_API_KEY"))
      .first();

    if (!stored) {
      return null;
    }

    const now = Date.now();
    const expireDate = new Date(stored.expireTime).getTime();

    if (now >= expireDate) {
      return null;
    }

    return stored.value;
  },
});
