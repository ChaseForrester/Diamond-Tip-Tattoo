/**
 * GET /api/meta/status
 * Safe health check — does not expose secrets.
 * Use to confirm env vars are present after Vercel deploy.
 */
const {
    getPageToken,
    getVerifyToken,
    getAppSecret,
    getNotifyPsids,
    messengerConfigured
} = require("../lib/messenger");

module.exports = async function handler(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
        res.statusCode = 405;
        res.end(JSON.stringify({ ok: false, error: "GET only" }));
        return;
    }

    const token = getPageToken();
    const payload = {
        ok: true,
        service: "diamond-tip-meta-messenger",
        configured: messengerConfigured(),
        checks: {
            META_PAGE_ACCESS_TOKEN: token ? `set (${token.slice(0, 6)}…${token.slice(-4)})` : "MISSING",
            META_VERIFY_TOKEN: getVerifyToken() ? "set" : "MISSING",
            META_APP_SECRET: getAppSecret() ? "set" : "optional / not set",
            MESSENGER_NOTIFY_PSIDS: getNotifyPsids().length
                ? `${getNotifyPsids().length} PSID(s)`
                : "MISSING — message Page with “notify me” after webhook works"
        },
        webhookUrlHint: "/api/meta/webhook",
        nextSteps: messengerConfigured()
            ? ["Submit a test booking on the website", "Confirm studio phone/FB gets the Messenger text"]
            : [
                "Set META_PAGE_ACCESS_TOKEN + META_VERIFY_TOKEN in Vercel",
                "Paste webhook URL in Meta → Messenger → Configure webhooks",
                "Subscribe to messages + messaging_postbacks + messaging_referrals",
                "Message the Page “notify me”, copy PSID from Vercel logs",
                "Set MESSENGER_NOTIFY_PSIDS and redeploy"
            ]
    };

    res.statusCode = 200;
    res.end(JSON.stringify(payload, null, 2));
};
