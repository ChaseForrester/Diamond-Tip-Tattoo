/**
 * Meta Messenger Platform webhook
 *
 * URL to paste in Meta Developers → Messenger → Configure webhooks:
 *   https://diamond-tip-tattoo.vercel.app/api/meta/webhook
 *
 * GET  — subscription verification (hub.mode, hub.verify_token, hub.challenge)
 * POST — inbound messages / postbacks / referrals
 *
 * Verify token must match META_VERIFY_TOKEN in Vercel env.
 */

const {
    handleVerifyChallenge,
    verifySignature,
    processWebhookPayload,
    getVerifyToken
} = require("../lib/messenger");

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        if (typeof req.body === "string") {
            resolve(req.body);
            return;
        }
        if (Buffer.isBuffer(req.body)) {
            resolve(req.body.toString("utf8"));
            return;
        }
        // Already parsed object (Vercel sometimes does this)
        if (req.body && typeof req.body === "object") {
            resolve(JSON.stringify(req.body));
            return;
        }
        let raw = "";
        req.on("data", (c) => {
            raw += c;
            if (raw.length > 2_000_000) {
                reject(new Error("Body too large"));
                req.destroy();
            }
        });
        req.on("end", () => resolve(raw));
        req.on("error", reject);
    });
}

function parseQuery(req) {
    try {
        const u = new URL(req.url, `https://${req.headers.host || "localhost"}`);
        const q = {};
        u.searchParams.forEach((v, k) => {
            q[k] = v;
        });
        return q;
    } catch (_) {
        return {};
    }
}

module.exports = async function handler(req, res) {
    // ── GET: webhook verification ───────────────────────────────────
    if (req.method === "GET") {
        const query = { ...parseQuery(req), ...(req.query || {}) };
        const result = handleVerifyChallenge(query);
        if (result.ok) {
            console.log(
                JSON.stringify({
                    level: "info",
                    event: "meta_webhook_verified",
                    verifyTokenConfigured: !!getVerifyToken()
                })
            );
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/plain");
            res.end(result.challenge);
            return;
        }
        res.statusCode = 403;
        res.setHeader("Content-Type", "text/plain");
        res.end("Verification failed — check META_VERIFY_TOKEN matches Meta UI");
        return;
    }

    // ── POST: events ────────────────────────────────────────────────
    if (req.method === "POST") {
        let raw;
        try {
            raw = await readRawBody(req);
        } catch (e) {
            res.statusCode = 400;
            res.end("Bad body");
            return;
        }

        const sig = req.headers["x-hub-signature-256"] || "";
        const sigCheck = verifySignature(raw, sig);
        if (!sigCheck.ok) {
            console.warn("Meta webhook signature failed:", sigCheck.error);
            // Still return 200 only if secret not configured; otherwise reject
            if (!sigCheck.skipped) {
                res.statusCode = 401;
                res.end("Invalid signature");
                return;
            }
        }

        let body;
        try {
            body = typeof req.body === "object" && req.body && !Buffer.isBuffer(req.body)
                ? req.body
                : JSON.parse(raw || "{}");
        } catch (_) {
            res.statusCode = 400;
            res.end("Invalid JSON");
            return;
        }

        try {
            const result = await processWebhookPayload(body);
            console.log(JSON.stringify({ level: "info", event: "meta_webhook_processed", result }));
        } catch (e) {
            console.error("Meta webhook process error:", e);
            // Always 200 quickly so Meta doesn't disable the webhook
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    res.statusCode = 405;
    res.end("Method not allowed");
};
