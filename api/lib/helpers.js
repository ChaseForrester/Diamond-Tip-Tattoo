/**
 * Shared helpers for Diamond Tip Tattoo form webhooks (Vercel serverless).
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://diamond-tip-tattoo.web.app",
  "https://diamond-tip-tattoo.firebaseapp.com",
  "https://www.diamondtiptattoo.com",
  "https://diamondtiptattoo.com",
  "https://diamond-tip-tattoo.vercel.app",
  "http://localhost:5000",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080"
];

function parseAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = fromEnv.length ? fromEnv : DEFAULT_ALLOWED_ORIGINS.slice();

  // Always allow the deployment host itself (Vercel preview / production)
  if (process.env.VERCEL_URL) {
    list.push(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    list.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return [...new Set(list)];
}

function setCors(res, req) {
  const origin = req.headers.origin || "";
  const allowed = parseAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin) {
    // Non-browser callers (curl, Zapier tests)
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Form-Secret, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    if (typeof req.body === "string") {
      try {
        resolve(req.body ? JSON.parse(req.body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      // Cap at ~1.5MB — previews should be Storage URLs, not huge base64
      if (raw.length > 1_500_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function isHoneypotTripped(body) {
  const hp = body?.website || body?.honeypot || body?._gotcha;
  return typeof hp === "string" && hp.trim().length > 0;
}

function requireSecret(req) {
  const expected = process.env.FORM_WEBHOOK_SECRET;
  if (!expected) return true; // optional until configured
  const got =
    req.headers["x-form-secret"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return got && got === expected;
}

function stripHeavyFields(payload) {
  // Never forward raw data: URLs — only http(s) image links
  const clone = JSON.parse(JSON.stringify(payload || {}));
  const scrub = (val) => {
    if (typeof val !== "string") return val;
    if (val.startsWith("data:")) return "[inline image omitted — use previewUrl]";
    if (val.length > 8000) return val.slice(0, 8000) + "…[truncated]";
    return val;
  };
  if (clone.tryOnPreviewUrl) clone.tryOnPreviewUrl = scrub(clone.tryOnPreviewUrl);
  if (clone.tryOn?.previewUrl) clone.tryOn.previewUrl = scrub(clone.tryOn.previewUrl);
  if (Array.isArray(clone.referenceImages)) {
    clone.referenceImages = clone.referenceImages.map(scrub).filter((u) => {
      return typeof u === "string" && !u.startsWith("data:");
    });
  }
  if (clone.idea) clone.idea = scrub(String(clone.idea));
  if (clone.notes) clone.notes = scrub(String(clone.notes));
  return clone;
}

function formatBookingText(data) {
  const t = data.tryOn || null;
  const refs = data.referenceImages || [];
  return [
    "NEW CONSULTATION REQUEST — Diamond Tip Tattoo website",
    "",
    `Name: ${data.name || "—"}`,
    `Email: ${data.email || "—"}`,
    `Phone: ${data.phone || "—"}`,
    `Preferred date: ${data.date || "—"}`,
    `Preferred time: ${data.time || "—"}`,
    `Style: ${data.style || "—"}`,
    `Preferred artist: ${data.preferredArtist || "—"}`,
    `Source: ${data.source || "website"}`,
    "",
    "Idea:",
    data.idea || "—",
    "",
    t
      ? `Try-on: placement=${t.placementLabel || t.placement || "—"}, size=${t.scale ?? "—"}%, rotation=${t.rotation ?? "—"}°, wrap=${t.wrap ?? "—"}%`
      : "Try-on: none",
    t?.previewUrl ? `Try-on preview: ${t.previewUrl}` : "",
    data.tryOnPreviewUrl && data.tryOnPreviewUrl !== t?.previewUrl
      ? `Try-on preview URL: ${data.tryOnPreviewUrl}`
      : "",
    "",
    `Reference images: ${refs.length}`,
    ...refs.map((u, i) => `  ${i + 1}. ${u}`),
    "",
    `Booking ID: ${data.id || "—"}`,
    `Created: ${data.createdAt || new Date().toISOString()}`
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatOrderText(order) {
  const itemLines = (order.items || []).map(
    (i) => `  • ${i.name} × ${i.qty} — $${Number(i.lineTotal || 0).toFixed(2)}`
  );
  return [
    "NEW STUDIO PICKUP ORDER — Diamond Tip Tattoo website",
    "",
    `Name: ${order.name || "—"}`,
    `Email: ${order.email || "—"}`,
    `Phone: ${order.phone || "—"}`,
    `Pickup window: ${order.pickupWindow || "—"}`,
    `Notes: ${order.notes || "—"}`,
    "",
    "Items:",
    ...(itemLines.length ? itemLines : ["  (none)"]),
    "",
    `Total: $${Number(order.total || 0).toFixed(2)} AUD`,
    `Payment: pay at studio`,
    `Order ID: ${order.id || "—"}`,
    `Created: ${order.createdAt || new Date().toISOString()}`
  ].join("\n");
}

async function forwardOutboundWebhook(eventType, payload, text) {
  const url = process.env.OUTBOUND_WEBHOOK_URL || process.env.FORM_WEBHOOK_URL;
  if (!url) return { skipped: true, reason: "OUTBOUND_WEBHOOK_URL not set" };

  const body = {
    event: eventType,
    receivedAt: new Date().toISOString(),
    source: "diamond-tip-tattoo",
    text,
    data: payload
  };

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "DiamondTipTattoo-FormWebhook/1.0"
  };
  if (process.env.OUTBOUND_WEBHOOK_SECRET) {
    headers["X-Webhook-Secret"] = process.env.OUTBOUND_WEBHOOK_SECRET;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const responseText = await res.text().catch(() => "");
  return {
    ok: res.ok,
    status: res.status,
    body: responseText.slice(0, 500)
  };
}

async function notifyDiscord(eventType, text, payload) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { skipped: true };

  const title =
    eventType === "shop_order"
      ? "🛒 New shop pickup order"
      : payload?.tryOn || payload?.tryOnPreviewUrl
        ? "🎨 New try-on consultation"
        : "📅 New consultation request";

  const content = `${title}\n\`\`\`\n${String(text).slice(0, 1800)}\n\`\`\``;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  return { ok: res.ok, status: res.status };
}

async function notifyResendEmail({ subject, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true, reason: "RESEND_API_KEY not set" };

  const to = (process.env.NOTIFY_EMAILS || process.env.STUDIO_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length) {
    return { skipped: true, reason: "NOTIFY_EMAILS not set" };
  }

  const from =
    process.env.RESEND_FROM || "Diamond Tip Tattoo <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      reply_to: replyTo || undefined
    })
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, id: json.id, error: json.message };
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function handleOptions(req, res) {
  setCors(res, req);
  res.statusCode = 204;
  res.end();
}

module.exports = {
  setCors,
  readJsonBody,
  isHoneypotTripped,
  requireSecret,
  stripHeavyFields,
  formatBookingText,
  formatOrderText,
  forwardOutboundWebhook,
  notifyDiscord,
  notifyResendEmail,
  json,
  handleOptions
};
