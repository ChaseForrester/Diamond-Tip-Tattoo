# Diamond Tip Tattoo — Launch To-Do List

Marketing, integrations, and ops checklist after the conversion UX ship  
**GitHub:** https://github.com/ChaseForrester/Diamond-Tip-Tattoo (`main` @ `6aad708`)  
**Site:** https://diamond-tip-tattoo.web.app/

---

## Priority 0 — Meta Messenger + forms (active now)

**Full checklist:** `Notion/META-MESSENGER-FORMS-TODO.md`  
**Click guide:** `META-MESSENGER-SETUP.md`

- [ ] **Deploy Vercel** — Import GitHub repo; confirm `/api/meta/status` loads
- [ ] **Meta app use case** — “Engage with customers on Messenger from Meta”
- [ ] **Webhook** — `…/api/meta/webhook` + `META_VERIFY_TOKEN` verify in Meta
- [ ] **Page token** — `META_PAGE_ACCESS_TOKEN` + `META_APP_SECRET` in Vercel
- [ ] **Studio PSID** — Message Page `notify me` → set `MESSENGER_NOTIFY_PSIDS`
- [ ] **Point site at API** — `<meta name="dtt-form-api" content="https://YOUR.vercel.app">`
- [ ] **Test booking / try-on / shop** — Form details arrive in Messenger

## Priority 1 — Do first (bookings & ads)

- [ ] **Add Meta (Facebook) Pixel** — Create Pixel in Meta Events Manager and paste base code in site `<head>`. Site already fires `Lead` on booking if `fbq` exists.
- [ ] **Confirm Messenger link works** — Open https://m.me/diamondtiptattoo and verify it hits the correct Page inbox (not a dead profile chat).
- [ ] **Enable Facebook Page Messaging** — Page Settings → Messaging on; reply SLA goal: same day.
- [ ] **Verify phone number** — Confirm `(02) 4261 4311` is live and rings the studio.
- [ ] **Verify email** — Confirm `hello@diamondtiptattoo.com` receives mail (DNS / inbox).
- [ ] **New booking alerts** — Vercel Messenger notify (Priority 0) + optional email/SMS when Firestore `bookings` is created.

## Priority 2 — Local SEO & trust

- [ ] **Google Business Profile** — Claim/verify Diamond Tip Tattoo Dapto; match address, hours, phone; set website + booking URL `#book`.
- [ ] **Google Reviews link** — Add Place ID review URL on the site reviews section once GBP is ready.
- [ ] **Google Analytics 4** — Confirm hits in GA4 property `G-SXX8SXNZHD` (site auto-loads gtag).
- [ ] **Custom domain** — Attach real domain; then update canonical, Open Graph, and schema URLs.

## Priority 3 — Social & chat

- [ ] **Optional: Meta Customer Chat plugin** — True on-site FB Chat (needs Page + app access).
- [ ] **Optional: ManyChat** — Auto-replies for after-hours Instagram/FB DMs.
- [ ] **Optional: WhatsApp Business** — Share business number to add sticky WhatsApp next to Messenger.
- [ ] **Instagram** — Link “Book” sticker / bio → site `#book`.
- [ ] **Facebook Page vs profile** — Prefer a business Page for ads, Messenger, and reviews.

## Priority 4 — Legal & polish

- [ ] **AU Privacy Policy** — Replace light in-site summary with proper policy if running ads/pixels.
- [ ] **Terms of Service** — Align deposit/cancellation rules with what you tell clients.
- [ ] **Smoke-test on phone after deploy** — Book form → success panel; sticky bar; Messenger; Call; Aftercare modal.

## Already shipped (no action unless regression)

- [x] Mobile UI spacing + nav drawer fix
- [x] Conversion hero, CTAs, sticky book bar
- [x] Booking form labels, artist preference, success state
- [x] FAQ objections, process steps, conversion strip
- [x] SEO meta, OG tags, TattooParlor schema
- [x] GA4 bootstrap + `data-track` events
- [x] Aftercare + Privacy/Terms modals
- [x] Real Facebook + Messenger links

## Notes for handoff

| Item | Value |
|------|--------|
| Meta Pixel ID | _paste when ready_ |
| WhatsApp number | _add if wanted_ |
| Google Review URL | _add when ready_ |
| Preferred domain | _add when ready_ |

---

### How to import into Notion

1. Open Notion → **New page**
2. Type `/import` or paste this whole file into a page  
   (checkboxes `- [ ]` become interactive to-dos when pasted as Markdown)
3. Or drag `NOTION-TODO-LIST.md` into Notion desktop
