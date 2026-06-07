// Supabase Edge Function: "scan"
// Phase 1: requires a valid authenticated user session.
// Turns a receipt or pantry photo into structured items using Claude vision.
// The Anthropic API key lives here as a secret (ANTHROPIC_API_KEY) and is never
// exposed to the browser. Deploy this and set the secret — see SCAN-SETUP.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-sonnet-4-6"; // accuracy. For lower cost use "claude-haiku-4-5-20251001".
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Pull the first {...} JSON object out of the model's reply (handles ```json fences).
function extractJson(text: string): any {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in model response");
  return JSON.parse(t.slice(start, end + 1));
}

function receiptPrompt(today: string): string {
  return [
    "You extract grocery items from a photo of a store receipt.",
    "Return ONLY valid JSON, no prose, in exactly this shape:",
    '{"items":[{"item":"string","category":"string","quantity":number,"unit":"string","location":"Pantry|Fridge|Freezer","expiration":"YYYY-MM-DD or null","notes":"string"}]}',
    `Today's date is ${today}.`,
    "Rules: expand cryptic receipt abbreviations into normal product names; pick a sensible category and storage location; estimate an expiration date from typical shelf life relative to today (fresh deli/dairy short, canned/dry long); skip non-item lines like subtotal, tax, savings, and payment; if quantity is unclear use 1; leave expiration null only if you truly cannot estimate.",
  ].join("\n");
}

function reconcilePrompt(today: string, inventory: unknown): string {
  return [
    "You reconcile a photo of a pantry/fridge shelf against a known inventory.",
    `Today's date is ${today}.`,
    "Current inventory (JSON):",
    JSON.stringify(inventory),
    "Look at the photo and return ONLY valid JSON in exactly this shape:",
    '{"add":[{"item":"string","category":"string","quantity":number,"unit":"string","location":"Pantry|Fridge|Freezer","expiration":"YYYY-MM-DD or null","notes":"string"}],"missing":[{"id":"string","item":"string"}],"changed":[{"id":"string","item":"string","quantity":number}]}',
    "Rules: 'add' = items clearly visible in the photo that are NOT already in inventory. 'missing' = inventory items you are fairly confident are NOT visible (likely used up) — include only when reasonably confident, and copy their exact id. 'changed' = items whose visible quantity clearly differs from inventory, with the new quantity and exact id. Be conservative: a camera only sees the front row and cannot read every label, so when unsure, leave it out. Empty arrays are fine.",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // ── Phase 1: require an authenticated user session ──────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  if (supabaseUrl && supabaseAnonKey) {
    // Verify the token is a real user session (not just the anon key)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return json({ error: "Authentication required — sign in first" }, 401);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Server missing ANTHROPIC_API_KEY secret" }, 500);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const mode = payload.mode === "reconcile" ? "reconcile" : "receipt";

  // Accept either a single `image` or an array of `images` (video frames + photos).
  let imgs: string[] = Array.isArray(payload.images) ? payload.images
    : (payload.image ? [payload.image] : []);
  imgs = imgs.filter(function (s) { return typeof s === "string" && s.length > 0; }).slice(0, 10);
  if (!imgs.length) return json({ error: "Missing image(s)" }, 400);

  // Build a Claude image block from each (full data URL or raw base64).
  const imageBlocks = imgs.map(function (img: string) {
    let mediaType = "image/jpeg", data = img;
    const m = img.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/s);
    if (m) { mediaType = m[1]; data = m[2]; }
    return { type: "image", source: { type: "base64", media_type: mediaType, data: data } };
  });

  const today = new Date().toISOString().slice(0, 10);
  const prompt = mode === "reconcile"
    ? reconcilePrompt(today, payload.inventory || [])
    : receiptPrompt(today);
  const note = imageBlocks.length > 1
    ? "\nThe " + imageBlocks.length + " images are different views/frames of the same pantry — combine them into one result and do not double-count the same physical item seen in multiple frames."
    : "";

  const body = {
    model: MODEL,
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: imageBlocks.concat([{ type: "text", text: prompt + note } as any]),
    }],
  };

  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ error: "Could not reach Anthropic API: " + String(e) }, 502);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return json({ error: "Anthropic API error", status: resp.status, detail: errText }, 502);
  }

  const data = await resp.json();
  const text = (data.content && data.content[0] && data.content[0].text) || "";
  try {
    const parsed = extractJson(text);
    return json({ mode, ...parsed });
  } catch (e) {
    return json({ error: "Could not parse model output", raw: text }, 502);
  }
});
