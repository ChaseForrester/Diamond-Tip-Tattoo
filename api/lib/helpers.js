/**
 * Shared helpers for Diamond Tip Tattoo form webhooks (Vercel serverless).
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.diamondtiptattoo.com.au",
  "https://diamondtiptattoo.com.au",
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

/** Guaranteed inbox while Messenger / Resend are being set up */
const FALLBACK_NOTIFY_EMAIL = "hello@techaidaustralia.com.au";

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

function collectMediaUrls(data) {
  const out = [];
  const add = (u) => {
    if (typeof u === "string" && /^https?:\/\//i.test(u) && !u.startsWith("data:")) {
      out.push(u);
    }
  };
  (data?.referenceImages || []).forEach(add);
  (data?.referenceFiles || []).forEach((f) => add(f && f.url));
  add(data?.tryOnPreviewUrl);
  add(data?.tryOn?.previewUrl);
  return [...new Set(out)];
}

function formatBookingText(data) {
  const t = data.tryOn || null;
  const refs = collectMediaUrls(data);
  const files = data.referenceFiles || [];
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
    `Attachments: ${refs.length}`,
    ...(files.length
      ? files.map((f, i) => `  ${i + 1}. ${f.name || "file"} (${f.type || "file"}) — ${f.url || ""}`)
      : refs.map((u, i) => `  ${i + 1}. ${u}`)),
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

function notifyEmailList() {
  const fromEnv = (process.env.NOTIFY_EMAILS || process.env.STUDIO_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = fromEnv.length ? fromEnv : [FALLBACK_NOTIFY_EMAIL];
  if (!list.includes(FALLBACK_NOTIFY_EMAIL)) list.unshift(FALLBACK_NOTIFY_EMAIL);
  return [...new Set(list)];
}

async function notifyFormSubmitEmail({ subject, text, replyTo, fields }) {
  const to = FALLBACK_NOTIFY_EMAIL;
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      _subject: subject,
      _template: "table",
      _captcha: "false",
      _replyto: replyTo || "",
      message: text,
      ...(fields || {})
    })
  });
  const json = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    to,
    error: json.message || json.error
  };
}

async function notifyResendEmail({ subject, text, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true, reason: "RESEND_API_KEY not set" };

  const to = notifyEmailList();
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
      html: html || undefined,
      reply_to: replyTo || undefined
    })
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, id: json.id, error: json.message, to };
}

/** Email always — FormSubmit to Tech Aid inbox, plus Resend if a key is set. */
async function notifyStudioEmail({ subject, text, replyTo, fields }) {
  const results = { formsubmit: null, resend: null };
  try {
    results.formsubmit = await notifyFormSubmitEmail({ subject, text, replyTo, fields });
  } catch (e) {
    results.formsubmit = { ok: false, error: e.message };
  }
  try {
    results.resend = await notifyResendEmail({ subject, text, replyTo });
  } catch (e) {
    results.resend = { ok: false, error: e.message };
  }
  const ok = !!(results.formsubmit?.ok || results.resend?.ok);
  return { ok, skipped: false, to: notifyEmailList(), results };
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
  collectMediaUrls,
  formatBookingText,
  formatOrderText,
  forwardOutboundWebhook,
  notifyDiscord,
  notifyResendEmail,
  notifyFormSubmitEmail,
  notifyStudioEmail,
  notifyEmailList,
  FALLBACK_NOTIFY_EMAIL,
  json,
  handleOptions
};
