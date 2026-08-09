# Diamond Tip Tattoo — Connect Facebook Messenger to website forms

This matches the Meta screens you saved as PDFs:

- **Create an app** → use cases list  
- **Customize use case → Messenger from Meta** (webhooks + API setup)

Code is already ready on Vercel routes:

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/meta/webhook` | Meta webhook (verify + inbound messages) |
| `GET /api/meta/status` | Safe checklist of env vars |
| `POST /api/forms/booking` | Booking + try-on → Messenger notify |
| `POST /api/forms/order` | Shop order → Messenger notify |

---

## How it works (simple)

```
Customer fills website form
        │
        ├─► Firestore (CRM)  [already works]
        ├─► Vercel /api/forms/booking
        │         └─► Graph API → messages YOU on Messenger (studio PSID)
        └─► Opens m.me/diamondtiptattoo?ref=booking_xxx
                  └─► Customer chats Page; bot auto-replies; you see it in Inbox
```

Meta **cannot** silently invent a Messenger chat from a form alone.  
We do both: **server push to studio** + **customer m.me handoff**.

---

## Before you click anything

1. You need **admin** access on the Facebook **Page** (Diamond Tip Tattoo), not only a personal profile.
2. Use the same Facebook account that manages the Page at [developers.facebook.com](https://developers.facebook.com).
3. Deploy this repo to **Vercel** so these URLs exist (replace with your project):

```text
https://YOUR-PROJECT.vercel.app/api/meta/webhook
https://YOUR-PROJECT.vercel.app/api/meta/status
```

---

## Step 0 — Deploy API first (do this once)

1. Import `ChaseForrester/Diamond-Tip-Tattoo` into Vercel (or push if already linked).
2. After deploy, open:

```text
https://YOUR-PROJECT.vercel.app/api/meta/status
```

You should see JSON. Tokens will say `MISSING` until Step 4.

3. In the website `index.html`, set:

```html
<meta name="dtt-form-api" content="https://YOUR-PROJECT.vercel.app">
```

so forms hit Vercel while the static site stays on Firebase.

---

## Step 1 — Create / open the Meta app (your PDF: “Create an app”)

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps).
2. **Create app** (or open **Diamond Tip Tattoo** if it already exists).
3. App type / portfolio: use your **business portfolio** if asked.
4. On **Add use cases** (your screenshots):

### Select this use case

**Engage with customers on Messenger from Meta**  
*(wording may be: “Respond to messages sent to your business’ Facebook Page”)*

### Do NOT pick (for this job)

| Skip | Why |
|------|-----|
| Create & manage ads / Marketing API | Ads, not form inbox |
| Facebook Login only | Logins, not Page messaging |
| WhatsApp | Different product |
| Create an app without a use case | Harder later |
| Other / old experience | Going away |

5. Click **Next** / **Continue** until the app is created and you land on **Use cases → Customize**.

---

## Step 2 — Customize Messenger use case (your PDF: Use cases)

Left sidebar should show something like:

- Messenger from Meta  
- Permissions and features  
- **Messenger API Settings**  
- API integration helper  
- Instagram settings  

Open **Messenger API Settings** (or **Messenger Platform** welcome panel).

You will see roughly:

1. **Configure webhooks**  
2. **Generate access tokens** (connect a Facebook Page)  
3. Optional: build-a-bot / sample  

Do them in order below.

---

## Step 3 — Configure webhooks (Meta screen “1. Configure webhooks”)

1. Click **Configure webhooks** / **Add callback URL**.
2. Fill:

| Field | Value |
|-------|--------|
| **Callback URL** | `https://YOUR-PROJECT.vercel.app/api/meta/webhook` |
| **Verify token** | Same string you will put in Vercel as `META_VERIFY_TOKEN` |

**Recommended verify token** (you can invent your own):

```text
diamond_tip_messenger_verify_2026
```

3. **Before** clicking Verify in Meta, set in Vercel → Project → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `META_VERIFY_TOKEN` | `diamond_tip_messenger_verify_2026` (exact same) |

4. Redeploy Vercel (or wait for auto redeploy).
5. Back in Meta, click **Verify and save**.

- Success → green / saved.  
- Fail → open `/api/meta/status`, confirm verify token is `set`, check URL has no typo, no trailing slash issues.

6. **Subscribe to webhook fields** (check these):

- [x] `messages`  
- [x] `messaging_postbacks`  
- [x] `messaging_optins`  
- [x] `messaging_referrals`  
- [x] `message_deliveries` (optional)

Save.

---

## Step 4 — Connect the Facebook Page + Page access token

Still under Messenger API settings:

1. **Add / connect Page** → choose **Diamond Tip Tattoo** Page.  
2. Accept permissions (manage messages, etc.).  
3. Click **Generate** token for that Page.  
4. Copy the **Page access token** (long string).  
5. Put in Vercel env:

| Name | Value |
|------|--------|
| `META_PAGE_ACCESS_TOKEN` | *(paste token)* |
| `META_PAGE_ID` | *(Page ID if shown — optional)* |

6. Also copy **App secret**: App → **Settings → Basic → App secret → Show**.

| Name | Value |
|------|--------|
| `META_APP_SECRET` | *(paste)* |

7. Redeploy Vercel.

Open again:

```text
https://YOUR-PROJECT.vercel.app/api/meta/status
```

`META_PAGE_ACCESS_TOKEN` should show `set (xxxxxx…yyyy)`.

---

## Step 5 — Get your PSID (so forms can message *you*)

Meta only lets the Page message people who have talked to the Page.

1. On your phone, open Messenger and message **your Page** (or open `https://m.me/diamondtiptattoo`).
2. Send exactly:

```text
notify me
```

3. If the webhook is live, the bot replies with **your PSID** (a long number).  
4. Also check **Vercel → Project → Logs** for a line like:

```json
{"event":"messenger_inbound","psid":"1234567890",...}
```

5. Put that number in Vercel:

| Name | Value |
|------|--------|
| `MESSENGER_NOTIFY_PSIDS` | `1234567890` |

Multiple people (Steven, Scotty, you):

```text
111111,222222,333333
```

Each person must message the Page once (or send `notify me`).

6. Redeploy.

`/api/meta/status` should show `configured: true`.

---

## Step 6 — Permissions (your second use-case PDF)

On **Permissions and features**:

### Required for messaging

- Messenger / pages messaging related permissions from the Messenger use case  
- Usually granted automatically for **dev mode** for app admins/testers  

### During development (important)

In **dev mode**, the bot can only talk to:

- App **admins**  
- App **developers**  
- App **testers**  

Add staff: App → **App roles** → Add testers → they accept the invite.

### Going live later (optional)

- App Review for `pages_messaging` if you need to message the general public via automation  
- For **studio notify + customer started the chat**, you can often stay productive in dev mode while testing with staff accounts  

---

## Step 7 — Point the website forms at Vercel

1. Set in `index.html`:

```html
<meta name="dtt-form-api" content="https://YOUR-PROJECT.vercel.app">
```

2. Deploy/host the static site (Firebase or Vercel).  
3. Submit a **test booking** on the live site.  
4. You should get a Messenger message on the Page thread with the form details.  
5. Customer m.me window may also open with `?ref=booking_…` (auto-reply).

---

## Step 8 — Checklist (print this)

- [ ] Vercel project deployed  
- [ ] `/api/meta/status` loads  
- [ ] Use case: **Messenger from Meta** selected  
- [ ] Webhook URL saved + verified  
- [ ] Subscribed: messages, postbacks, referrals  
- [ ] Page connected + token generated  
- [ ] `META_VERIFY_TOKEN` / `META_PAGE_ACCESS_TOKEN` / `META_APP_SECRET` in Vercel  
- [ ] Messaged Page `notify me` → got PSID  
- [ ] `MESSENGER_NOTIFY_PSIDS` set  
- [ ] `dtt-form-api` meta points at Vercel  
- [ ] Test booking appears in Messenger  

---

## What each PDF screen is asking

### “Create an app / Add use cases”

Pick **Messenger** business messaging — not ads, not Login-only.

### “Customize use case / Messenger API Setup”

1. Webhooks → our `/api/meta/webhook`  
2. Token → Page access token → Vercel  
3. Test → message Page / submit form  

### “Permissions and features”

Add only what Messenger setup requests.  
`email`, `ads_management`, `business_management` are **not required** for form→Messenger.

---

## Common errors

| Symptom | Fix |
|---------|-----|
| Webhook verification failed | `META_VERIFY_TOKEN` mismatch or API not deployed |
| Token set but no messages | Empty `MESSENGER_NOTIFY_PSIDS` or person never messaged Page |
| `(#10) permission denied` | User not admin/tester of app, or Page not connected |
| `(#551) person not available` | Outside messaging window; send `notify me` again from that FB account |
| Forms don’t hit API | Empty `dtt-form-api` meta while site is on Firebase |
| Works for you, not client | Dev mode — add them as tester or submit App Review |

---

## Next prompts you can send me (copy/paste)

After each step, paste back what you see:

1. **“Webhook verified — here’s /api/meta/status JSON”**  
2. **“Got PSID: ________”** (I can confirm env format)  
3. **“Token generated but Meta shows error: …”** (screenshot/error text)  
4. **“Test booking submitted — no Messenger message”** (I’ll debug with logs)  
5. **“Ready for App Review / go live”** (permissions + privacy policy steps)  
6. **“Also connect Instagram Messaging”** (same app, extra product)  

---

## Security notes

- Never commit tokens to GitHub.  
- Only put secrets in **Vercel Environment Variables**.  
- Rotate the Page token if it ever leaks.  
- Keep `META_APP_SECRET` set so webhook signatures are checked.
