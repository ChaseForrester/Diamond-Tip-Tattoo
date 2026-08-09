/**
 * POST /api/forms/order
 *
 * Webhook for the shop / aftercare checkout (studio pickup) form.
 *
 * Env: same as api/forms/booking.js
 */

const {
  setCors,
  readJsonBody,
  isHoneypotTripped,
  requireSecret,
  stripHeavyFields,
  formatOrderText,
  forwardOutboundWebhook,
  notifyDiscord,
  notifyResendEmail,
  json,
  handleOptions
} = require("../lib/helpers");
const { notifyStudioMessenger } = require("../lib/messenger");

function validateOrder(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["Missing JSON body"];
  }
  if (!String(body.name || "").trim()) errors.push("name is required");
  if (!String(body.email || "").trim()) errors.push("email is required");
  if (!String(body.phone || "").trim()) errors.push("phone is required");
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("items are required");
  }
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

  if (isHoneypotTripped(body)) {
    json(res, 200, { ok: true, ignored: true });
    return;
  }

  const errors = validateOrder(body);
  if (errors.length) {
    json(res, 400, { ok: false, error: "Validation failed", details: errors });
    return;
  }

  const payload = stripHeavyFields({
    ...body,
    id: body.id || `ord_${Date.now()}`,
    createdAt: body.createdAt || new Date().toISOString(),
    type: body.type || "shop_order",
    currency: body.currency || "AUD",
    fulfillment: body.fulfillment || "studio_pickup"
  });

  const eventType = "shop_order";
  const text = formatOrderText(payload);
  const subject = `New shop pickup order — ${payload.name} ($${Number(payload.total || 0).toFixed(2)})`;

  const results = {
    messenger: null,
    outbound: null,
    discord: null,
    email: null
  };

  try {
    results.messenger = await notifyStudioMessenger(text, {
      eventType,
      id: payload.id
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

  try {
    results.email = await notifyResendEmail({
      subject,
      text,
      replyTo: payload.email
    });
  } catch (e) {
    results.email = { ok: false, error: e.message };
  }

  const anyConfigured =
    results.messenger?.skipped !== true ||
    results.outbound?.skipped !== true ||
    results.discord?.skipped !== true ||
    results.email?.skipped !== true;

  console.log(
    JSON.stringify({
      level: "info",
      event: eventType,
      orderId: payload.id,
      name: payload.name,
      email: payload.email,
      total: payload.total,
      notifiers: results
    })
  );

  json(res, 200, {
    ok: true,
    event: eventType,
    id: payload.id,
    delivered: anyConfigured,
    results
  });
};
