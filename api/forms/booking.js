/**
 * POST /api/forms/booking
 *
 * Webhook for the consultation booking form, including try-on
 * ("see it on you" tattoo-on-body) attachments.
 *
 * Body: booking payload from the site (name, email, date, tryOn, …)
 *
 * Env (Vercel project settings):
 *   OUTBOUND_WEBHOOK_URL   — Zapier / Make / n8n / custom CRM URL
 *   OUTBOUND_WEBHOOK_SECRET
 *   DISCORD_WEBHOOK_URL
 *   RESEND_API_KEY + NOTIFY_EMAILS + RESEND_FROM
 *   FORM_WEBHOOK_SECRET    — optional shared secret from the site
 *   ALLOWED_ORIGINS        — comma-separated browser origins
 */

const {
  setCors,
  readJsonBody,
  isHoneypotTripped,
  requireSecret,
  stripHeavyFields,
  formatBookingText,
  forwardOutboundWebhook,
  notifyDiscord,
  notifyStudioEmail,
  collectMediaUrls,
  json,
  handleOptions
} = require("../lib/helpers");
const { notifyStudioMessenger } = require("../lib/messenger");

function validateBooking(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["Missing JSON body"];
  }
  if (!String(body.name || "").trim()) errors.push("name is required");
  if (!String(body.email || "").trim()) errors.push("email is required");
  const email = String(body.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("email is invalid");
  }
  // Date/time preferred for consultations but not hard-required for lead capture
  return errors;
}

module.exports = async function handler(req, res) {
  setCors(res, req);

  if (req.method === "OPTIONS") {
    handleOptions(req, res);
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  if (!requireSecret(req)) {
    json(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    json(res, 400, { ok: false, error: e.message || "Bad request" });
    return;
  }

  // Silent success for bots (honeypot)
  if (isHoneypotTripped(body)) {
    json(res, 200, { ok: true, ignored: true });
    return;
  }

  const errors = validateBooking(body);
  if (errors.length) {
    json(res, 400, { ok: false, error: "Validation failed", details: errors });
    return;
  }

  const payload = stripHeavyFields({
    ...body,
    id: body.id || `bk_${Date.now()}`,
    createdAt: body.createdAt || new Date().toISOString(),
    type: body.type || "consultation_request",
    channel: body.channel || "website",
    hasTryOn: !!(body.tryOn || body.tryOnPreviewUrl)
  });

  const eventType =
    payload.hasTryOn || payload.source === "website_try_on_booking"
      ? "try_on_booking"
      : "booking_request";

  const text = formatBookingText(payload);
  const subject = payload.hasTryOn
    ? `New try-on consultation — ${payload.name}`
    : `New booking request — ${payload.name}${payload.date ? ` (${payload.date} ${payload.time || ""})` : ""}`;

  const mediaUrls = collectMediaUrls(payload);
  const results = {
    messenger: null,
    outbound: null,
    discord: null,
    email: null
  };

  // Always email Tech Aid / studio first so leads are never dropped
  try {
    results.email = await notifyStudioEmail({
      subject,
      text,
      replyTo: payload.email,
      fields: {
        name: payload.name,
        email: payload.email,
        phone: payload.phone || "",
        date: payload.date || "",
        time: payload.time || "",
        style: payload.style || "",
        preferredArtist: payload.preferredArtist || "",
        bookingId: payload.id,
        attachments: mediaUrls.join("\n")
      }
    });
  } catch (e) {
    results.email = { ok: false, error: e.message };
  }

  // Messenger when Page token + PSIDs are configured (attachments follow the text)
  try {
    results.messenger = await notifyStudioMessenger(text, {
      eventType,
      hasTryOn: payload.hasTryOn,
      id: payload.id,
      mediaUrls
    });
  } catch (e) {
    results.messenger = { ok: false, error: e.message };
  }

  try {
    results.outbound = await forwardOutboundWebhook(eventType, payload, text);
  } catch (e) {
    results.outbound = { ok: false, error: e.message };
  }

  try {
    results.discord = await notifyDiscord(eventType, text, payload);
  } catch (e) {
    results.discord = { ok: false, error: e.message };
  }

  const anyConfigured =
    results.messenger?.skipped !== true ||
    results.outbound?.skipped !== true ||
    results.discord?.skipped !== true ||
    results.email?.skipped !== true;

  // Still accept the lead even if no notifiers are configured (logged for Vercel)
  console.log(
    JSON.stringify({
      level: "info",
      event: eventType,
      bookingId: payload.id,
      hasTryOn: payload.hasTryOn,
      name: payload.name,
      email: payload.email,
      notifiers: results
    })
  );

  json(res, 200, {
    ok: true,
    event: eventType,
    id: payload.id,
    hasTryOn: payload.hasTryOn,
    delivered: anyConfigured,
    results
  });
};
