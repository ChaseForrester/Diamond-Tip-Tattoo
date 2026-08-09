/**
 * Facebook Messenger Platform helpers (Graph API).
 *
 * Env (Vercel):
 *   META_PAGE_ACCESS_TOKEN  — Page token from Messenger API settings
 *   META_PAGE_ID            — Facebook Page ID (optional; "me" works with page token)
 *   META_APP_SECRET         — App secret (webhook signature verify)
 *   META_VERIFY_TOKEN       — YOU choose this string; paste same value in Meta webhook UI
 *   MESSENGER_NOTIFY_PSIDS  — comma-separated Page-Scoped IDs to notify on new forms
 *                             (admins/artists who have messaged the Page bot once)
 *   GRAPH_API_VERSION       — default v21.0
 */

const crypto = require("crypto");

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v21.0";

function graphBase() {
    return `https://graph.facebook.com/${GRAPH_VERSION}`;
}

function getPageToken() {
    return (
        process.env.META_PAGE_ACCESS_TOKEN ||
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
        process.env.PAGE_ACCESS_TOKEN ||
        ""
    ).trim();
}

function getVerifyToken() {
    return (
        process.env.META_VERIFY_TOKEN ||
        process.env.FACEBOOK_VERIFY_TOKEN ||
        "diamond_tip_messenger_verify_2026"
    ).trim();
}

function getAppSecret() {
    return (process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "").trim();
}

function getNotifyPsids() {
    return (process.env.MESSENGER_NOTIFY_PSIDS || process.env.META_NOTIFY_PSIDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Meta text messages max ~2000 chars */
function chunkText(text, max = 1900) {
    const s = String(text || "");
    if (s.length <= max) return [s];
    const chunks = [];
    let i = 0;
    while (i < s.length) {
        chunks.push(s.slice(i, i + max));
        i += max;
    }
    return chunks;
}

/**
 * Send a text message to a PSID via the Page.
 * @param {string} psid
 * @param {string} text
 * @param {{ messagingType?: string, tag?: string }} opts
 */
async function sendTextMessage(psid, text, opts = {}) {
    const token = getPageToken();
    if (!token) {
        return { ok: false, skipped: true, error: "META_PAGE_ACCESS_TOKEN not set" };
    }
    if (!psid) {
        return { ok: false, error: "Missing recipient PSID" };
    }

    const messagingType = opts.messagingType || "RESPONSE";
    const body = {
        recipient: { id: String(psid) },
        messaging_type: messagingType,
        message: { text: String(text || "").slice(0, 2000) }
    };
    // Out-of-window tags (use sparingly; ACCOUNT_UPDATE is limited)
    if (opts.tag) {
        body.messaging_type = "MESSAGE_TAG";
        body.tag = opts.tag;
    }

    const url = `${graphBase()}/me/messages?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
        return {
            ok: false,
            status: res.status,
            error: json.error?.message || res.statusText,
            code: json.error?.code,
            raw: json
        };
    }
    return { ok: true, messageId: json.message_id, recipientId: json.recipient_id };
}

/** Send long form summaries as multiple messages if needed */
async function sendLongText(psid, text, opts = {}) {
    const chunks = chunkText(text);
    const results = [];
    for (const chunk of chunks) {
        // eslint-disable-next-line no-await-in-loop
        const r = await sendTextMessage(psid, chunk, opts);
        results.push(r);
        if (!r.ok && !r.skipped) break;
    }
    return {
        ok: results.every((r) => r.ok || r.skipped),
        chunks: results.length,
        results
    };
}

/**
 * Notify configured studio PSIDs about a form submission.
 * Falls back: RESPONSE → HUMAN_AGENT tag → ACCOUNT_UPDATE tag.
 */
async function notifyStudioMessenger(text, meta = {}) {
    const psids = getNotifyPsids();
    if (!psids.length) {
        return {
            skipped: true,
            reason:
                "MESSENGER_NOTIFY_PSIDS not set — message the Page bot once, copy your PSID from Vercel logs, add it in env"
        };
    }
    if (!getPageToken()) {
        return { skipped: true, reason: "META_PAGE_ACCESS_TOKEN not set" };
    }

    const header =
        meta.eventType === "shop_order"
            ? "🛒 NEW SHOP ORDER (website)"
            : meta.hasTryOn
                ? "🎨 NEW TRY-ON CONSULTATION (website)"
                : "📅 NEW BOOKING REQUEST (website)";

    const body = `${header}\n\n${text}`.slice(0, 6000);
    const deliveries = [];

    for (const psid of psids) {
        // Prefer open 24h window; then Human Agent (7 days); then ACCOUNT_UPDATE
        let result = await sendLongText(psid, body, { messagingType: "RESPONSE" });
        if (!result.ok) {
            result = await sendLongText(psid, body, { tag: "HUMAN_AGENT" });
        }
        if (!result.ok) {
            result = await sendLongText(psid, body, { tag: "ACCOUNT_UPDATE" });
        }
        deliveries.push({ psid, ...result });
    }

    const ok = deliveries.some((d) => d.ok);
    return { ok, skipped: false, deliveries };
}

/** Verify Meta webhook subscription handshake (GET) */
function handleVerifyChallenge(query) {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && token && token === getVerifyToken()) {
        return { ok: true, challenge: String(challenge || "") };
    }
    return { ok: false };
}

/** Optional X-Hub-Signature-256 check */
function verifySignature(rawBody, signatureHeader) {
    const secret = getAppSecret();
    if (!secret) return { ok: true, skipped: true }; // optional until secret set
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
        return { ok: false, error: "Missing X-Hub-Signature-256" };
    }
    const expected =
        "sha256=" +
        crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    try {
        const a = Buffer.from(expected);
        const b = Buffer.from(signatureHeader);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return { ok: false, error: "Invalid signature" };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Process inbound Messenger webhook events.
 * - Logs PSIDs so you can set MESSENGER_NOTIFY_PSIDS
 * - Auto-replies to customers who open m.me?ref=booking_...
 */
async function processWebhookPayload(body) {
    if (!body || body.object !== "page") {
        return { handled: false, reason: "not a page object" };
    }

    const actions = [];
    for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
            const senderId = event.sender?.id;
            const isEcho = !!event.message?.is_echo;
            if (!senderId || isEcho) continue;

            // Always log PSID — critical for setup
            console.log(
                JSON.stringify({
                    level: "info",
                    event: "messenger_inbound",
                    psid: senderId,
                    pageId: entry.id,
                    hasMessage: !!event.message,
                    hasPostback: !!event.postback,
                    hasReferral: !!(event.referral || event.message?.referral),
                    text: event.message?.text || null,
                    ref: event.referral?.ref || event.message?.referral?.ref || null
                })
            );

            actions.push({ type: "seen_psid", psid: senderId });

            const text = (event.message?.text || "").trim().toLowerCase();
            const ref =
                event.referral?.ref ||
                event.message?.referral?.ref ||
                event.postback?.referral?.ref ||
                "";

            // Opt-in keyword for studio staff
            if (text === "notify me" || text === "notify" || text === "subscribe forms") {
                const r = await sendTextMessage(
                    senderId,
                    [
                        "✅ You're registered for form notifications on this Page.",
                        "",
                        `Your PSID is: ${senderId}`,
                        "",
                        "Add this ID to Vercel env MESSENGER_NOTIFY_PSIDS (comma-separated if multiple).",
                        "After deploy, new website bookings & shop orders will message you here."
                    ].join("\n")
                );
                actions.push({ type: "notify_opt_in", psid: senderId, send: r });
                continue;
            }

            // Customer arrived via website form m.me?ref=...
            if (ref || text === "get started" || event.postback) {
                const refStr = String(ref || event.postback?.payload || "");
                let reply;
                if (refStr.startsWith("booking_") || refStr.startsWith("tryon_")) {
                    reply = [
                        "Thanks for booking with Diamond Tip Tattoo 💎",
                        "",
                        "We've received your consultation request from the website.",
                        "A team member will reply here shortly.",
                        "",
                        "Studio: Dapto NSW · (02) 4261 4311",
                        `Ref: ${refStr}`
                    ].join("\n");
                } else if (refStr.startsWith("order_")) {
                    reply = [
                        "Thanks for your studio pickup order 🛒",
                        "",
                        "We've received your order from the website.",
                        "We'll confirm pickup details in this chat.",
                        "",
                        `Ref: ${refStr}`
                    ].join("\n");
                } else {
                    reply = [
                        "Welcome to Diamond Tip Tattoo 💎",
                        "",
                        "Book a free consult: https://diamond-tip-tattoo.web.app/#book",
                        "Or tell us your idea, placement and preferred dates here.",
                        "",
                        "Phone: (02) 4261 4311"
                    ].join("\n");
                }
                const r = await sendTextMessage(senderId, reply, { messagingType: "RESPONSE" });
                actions.push({ type: "auto_reply", psid: senderId, ref: refStr, send: r });
                continue;
            }

            // Default light auto-reply for first-time free text (avoid loops: only if short hello)
            if (text && /^(hi|hello|hey|book|help)\b/.test(text)) {
                const r = await sendTextMessage(
                    senderId,
                    "Hi! 👋 Diamond Tip Tattoo here. Book online: https://diamond-tip-tattoo.web.app/#book — or describe your tattoo idea and we'll help."
                );
                actions.push({ type: "greeting_reply", psid: senderId, send: r });
            }
        }
    }

    return { handled: true, actions };
}

function messengerConfigured() {
    return !!(getPageToken() && getNotifyPsids().length);
}

module.exports = {
    getPageToken,
    getVerifyToken,
    getAppSecret,
    getNotifyPsids,
    sendTextMessage,
    sendLongText,
    notifyStudioMessenger,
    handleVerifyChallenge,
    verifySignature,
    processWebhookPayload,
    messengerConfigured,
    chunkText
};
