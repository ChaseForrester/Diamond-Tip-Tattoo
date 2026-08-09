# Diamond Tip Tattoo — Meta Messenger + Forms To-Do

Connect website booking / try-on / shop forms → Facebook Messenger  
**GitHub:** https://github.com/ChaseForrester/Diamond-Tip-Tattoo  
**Site:** https://diamond-tip-tattoo.web.app/  
**Guide in repo:** `META-MESSENGER-SETUP.md`  
**Updated:** 2026-08-09

> Paste this page into Notion (or drag the file). `- [ ]` checkboxes become interactive to-dos.

---

## How it works (quick)

```
Customer fills form on website
  → Firestore CRM (already works)
  → Vercel /api/forms/booking or /order
      → Graph API messages studio on Messenger (MESSENGER_NOTIFY_PSIDS)
  → Opens m.me/diamondtiptattoo?ref=booking_xxx (customer chat + auto-reply)
```

**Code already built** (local / ready to deploy):

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET/POST /api/meta/webhook` | Meta webhook verify + inbound messages | ✅ In repo |
| `GET /api/meta/status` | Env checklist (no secrets) | ✅ In repo |
| `POST /api/forms/booking` | Booking + try-on → Messenger notify | ✅ In repo |
| `POST /api/forms/order` | Shop order → Messenger notify | ✅ In repo |
| `vercel-analytics.js` | Vercel Web Analytics | ✅ In repo |
| Client m.me `?ref=` handoff | Booking / try-on / order | ✅ In repo |

---

## Priority A — Deploy API (do first)

- [ ] **Create / open Vercel project** — Import `ChaseForrester/Diamond-Tip-Tattoo` from GitHub
- [ ] **Deploy production** — Confirm deploy succeeds (static + `/api/*`)
- [ ] **Copy Vercel URL** — e.g. `https://YOUR-PROJECT.vercel.app` → paste in Notes table below
- [ ] **Open status page** — Visit `https://YOUR-PROJECT.vercel.app/api/meta/status` (JSON should load; tokens may say MISSING)
- [ ] **Set site form API base** — In `index.html` set  
  `<meta name="dtt-form-api" content="https://YOUR-PROJECT.vercel.app">`
- [ ] **Redeploy static site** — Firebase Hosting (or Vercel) so the meta tag is live

---

## Priority B — Meta app use case (your Downloads PDFs)

*Matches: “Create an app”, “Use cases”, “Messenger from Meta” screenshots*

- [ ] **Open Meta Developers** — https://developers.facebook.com/apps
- [ ] **Create or open app** — Name: Diamond Tip Tattoo (or existing app)
- [ ] **Business portfolio** — Link Tech Aid / studio business if prompted
- [ ] **Add use case: Messenger** — Select **Engage with customers on Messenger from Meta**  
  *(“Respond to messages sent to your business’ Facebook Page”)*
- [ ] **Skip wrong use cases** — Do **not** pick: Marketing API ads, Facebook Login only, WhatsApp, Threads-only, “app without a use case”
- [ ] **Open Customize** — Use cases → **Messenger from Meta** → Messenger API Settings

---

## Priority C — Webhook (Meta “1. Configure webhooks”)

- [ ] **Choose verify token** — Use: `diamond_tip_messenger_verify_2026` (or invent your own and use it everywhere)
- [ ] **Vercel env: `META_VERIFY_TOKEN`** — Same string as verify token → Production + Preview
- [ ] **Redeploy Vercel** after adding env
- [ ] **Callback URL in Meta** — `https://YOUR-PROJECT.vercel.app/api/meta/webhook`
- [ ] **Verify token in Meta** — Paste exact same `META_VERIFY_TOKEN`
- [ ] **Click Verify and save** — Must succeed (green/saved)
- [ ] **Subscribe webhook fields**
  - [ ] `messages`
  - [ ] `messaging_postbacks`
  - [ ] `messaging_optins`
  - [ ] `messaging_referrals`
  - [ ] `message_deliveries` (optional)
- [ ] **If verify fails** — Check URL typo, env redeployed, `/api/meta/status` shows verify token set

---

## Priority D — Page token + secrets

- [ ] **Connect Facebook Page** — Diamond Tip Tattoo Page (must be a **Page**, not personal profile only)
- [ ] **Generate Page access token** — Messenger API Settings → Generate
- [ ] **Vercel env: `META_PAGE_ACCESS_TOKEN`** — Paste token
- [ ] **Copy App secret** — App → Settings → Basic → App secret → Show
- [ ] **Vercel env: `META_APP_SECRET`** — Paste secret (webhook signature verify)
- [ ] **Optional: `META_PAGE_ID`** — Page ID if shown
- [ ] **Redeploy Vercel**
- [ ] **Confirm status** — `/api/meta/status` shows page token as `set (xxxxxx…yyyy)`

---

## Priority E — Studio notify PSIDs (so forms message *you*)

Meta only messages people who have talked to the Page.

- [ ] **Message the Page** — Open https://m.me/diamondtiptattoo from your phone
- [ ] **Send:** `notify me`
- [ ] **Copy PSID** — From bot reply **or** Vercel → Logs → `messenger_inbound` / `psid`
- [ ] **Vercel env: `MESSENGER_NOTIFY_PSIDS`** — Paste PSID (comma-separated for multiple people)
- [ ] **Add Steven / Scotty / staff** — Each person messages Page once (or `notify me`), add their PSIDs
- [ ] **App roles (dev mode)** — App → Roles → add Admins / Developers / Testers for anyone who must receive bot messages
- [ ] **Redeploy Vercel**
- [ ] **Confirm** — `/api/meta/status` → `"configured": true`

---

## Priority F — Wire + test forms

- [ ] **`dtt-form-api` meta is live** on production site
- [ ] **Test booking form** — Submit fake consult → expect Messenger message on studio PSID
- [ ] **Test try-on path** — Attach try-on preview → book → Messenger includes try-on / `tryon_` ref
- [ ] **Test shop checkout** — Place test pickup order → Messenger shop order text
- [ ] **Customer m.me opens** — After submit, Messenger opens with `?ref=booking_…` / `order_…`
- [ ] **Auto-reply works** — Customer gets “Thanks for booking…” style reply when webhook live
- [ ] **Page Inbox check** — Conversation visible in Facebook Page Inbox / Meta Business Suite
- [ ] **Firestore still saves** — Booking appears in portal CRM as before
- [ ] **Email backup still works** — FormSubmit / mail queue (if used) still fires

---

## Priority G — Vercel Analytics (optional same deploy)

- [ ] **Enable Web Analytics** — Vercel Project → Analytics → Enable
- [ ] **Redeploy after enable**
- [ ] **Confirm page views** — Visit site on Vercel domain (or production if hosted there)
- [ ] **Confirm custom events** — Booking / try-on / CTA events via `trackEvent` → Vercel

---

## Priority H — Permissions & go-live (later)

- [ ] **Review Permissions and features** — Only Messenger messaging needed; skip ads_management unless advertising
- [ ] **Stay in dev mode for staff testing** — Admins/testers only
- [ ] **Privacy Policy URL** — Needed for App Review if messaging public users at scale
- [ ] **App Review: `pages_messaging`** — When ready for production public messaging
- [ ] **Switch app to Live** — After review (if required)
- [ ] **Token rotation plan** — If token leaks, regenerate Page token + update Vercel

---

## Priority I — Related launch items (from original Notion list)

- [ ] **Confirm Messenger link** — https://m.me/diamondtiptattoo hits correct Page inbox
- [ ] **Enable Page Messaging** — Page Settings → Messaging on; same-day reply SLA
- [ ] **Meta Pixel** — Create Pixel; site already fires `Lead` on booking if `fbq` exists
- [ ] **Verify phone** — `(02) 4261 4311` rings studio
- [ ] **Verify email** — Studio inbox receives mail
- [ ] **Smoke-test on phone** — Book form → success → Messenger → Call → Aftercare

---

## Paste-back prompts (when stuck)

Copy one of these into chat with Grok after each step:

1. `Vercel URL is: ________`
2. `Webhook verify succeeded` / `Webhook verify failed: ________`
3. `Status JSON: {paste /api/meta/status}`
4. `Got PSID: ________`
5. `Token screen error: ________`
6. `Test form sent — no Messenger message`
7. `Ready for App Review / go live`

---

## Env vars checklist (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `META_VERIFY_TOKEN` | Yes | Same as Meta webhook verify token |
| `META_PAGE_ACCESS_TOKEN` | Yes | Page token from Messenger settings |
| `META_APP_SECRET` | Yes (recommended) | App → Settings → Basic |
| `MESSENGER_NOTIFY_PSIDS` | Yes | Comma-separated PSIDs after `notify me` |
| `META_PAGE_ID` | Optional | Page ID |
| `GRAPH_API_VERSION` | Optional | Default `v21.0` |
| `FORM_WEBHOOK_SECRET` | Optional | If you lock form POSTs |
| `RESEND_API_KEY` / `NOTIFY_EMAILS` | Optional | Email backup |
| `DISCORD_WEBHOOK_URL` | Optional | Discord backup |
| `OUTBOUND_WEBHOOK_URL` | Optional | Zapier / Make / n8n |

---

## Notes / fill in as you go

| Item | Value |
|------|--------|
| Vercel project URL | _paste_ |
| Meta App ID | _paste_ |
| Facebook Page ID | _paste_ |
| Verify token used | `diamond_tip_messenger_verify_2026` |
| Your PSID | _paste after notify me_ |
| Other PSIDs | _Steven / Scotty / …_ |
| `dtt-form-api` set? | Yes / No |
| Webhook verified? | Yes / No |
| First test booking date | _paste_ |
| Meta Pixel ID | _paste when ready_ |

---

## Already done in code (no action unless regression)

- [x] Vercel form webhooks: booking + shop order
- [x] Try-on payload on booking webhook
- [x] Meta Messenger webhook handler + verify challenge
- [x] Studio notify via Graph Send API
- [x] `notify me` PSID helper + auto-replies for refs
- [x] Client m.me ref for booking / try-on / order
- [x] Vercel Analytics package + inject script
- [x] `.env.example` + `META-MESSENGER-SETUP.md`

---

### How to import into Notion

1. Open Notion → **New page** (or open your Diamond Tip folder)
2. Title: **Meta Messenger + Forms To-Do**
3. Paste this whole file, **or** drag `Notion/META-MESSENGER-FORMS-TODO.md` into Notion desktop  
4. Checkboxes `- [ ]` become interactive to-dos when pasted as Markdown
