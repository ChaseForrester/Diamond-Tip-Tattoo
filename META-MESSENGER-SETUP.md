# Connect Facebook Messenger to the booking form

You already have a **Meta App ID**. The website form is wired. These clicks finish the connection so a booking lands in the Diamond Tip Tattoo Page inbox.

**Live API (already deployed)**

| What | URL |
|------|-----|
| Status (safe JSON, no secrets) | https://diamond-tip-tattoo.vercel.app/api/meta/status |
| Webhook (paste this in Meta) | https://diamond-tip-tattoo.vercel.app/api/meta/webhook |
| Booking form handler | `POST` https://diamond-tip-tattoo.vercel.app/api/forms/booking |
| Shop order handler | `POST` https://diamond-tip-tattoo.vercel.app/api/forms/order |
| Public site | https://diamond-tip-tattoo.web.app/ |

Current API status when last checked: **verify token is set**, **Page access token missing**, **studio notify PSIDs missing**. That is why the form does not yet message the Page automatically.

---

## What happens after this is done

```
Customer fills BOOK YOUR PRIVATE SESSION
        │
        ├─► Firestore CRM (already works)
        ├─► Vercel /api/forms/booking
        │         └─► Graph API messages YOU on Messenger
        └─► Opens m.me/diamondtiptattoo?ref=booking_…
                  └─► Customer chats the Page; bot auto-replies; you see it in Inbox
```

The App ID alone cannot send messages. Meta also needs:

1. The **Messenger use case** on that app  
2. A **webhook** pointing at our Vercel URL  
3. The **Page connected** + a **Page access token**  
4. Your **PSID** (you must message the Page once)

---

## Step 1 — Open the app you already created

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) while logged into the Facebook account that **admins the Diamond Tip Tattoo Page**.
2. Click the app that has your App ID.
3. Left sidebar: **Use cases**.
4. If you do **not** already see **Messenger from Meta** / **Engage with customers on Messenger**:
   - Click **Add use case**
   - Choose **Engage with customers on Messenger from Meta**  
     *(wording may be “Respond to messages sent to your business’ Facebook Page”)*
   - Do **not** pick Ads, Facebook Login-only, or WhatsApp for this job.
5. Open **Messenger from Meta → Customize → Messenger API Settings**.

Paste the App ID into the website (optional, used by the Facebook SDK):

In `index.html`:

```html
<meta name="facebook-app-id" content="YOUR_APP_ID_HERE">
```

---

## Step 2 — Add the site domains in the app

Still in the app:

1. **Settings → Basic**
2. Copy **App ID** (you have this) and **App secret** (click Show — you will put this in Vercel in Step 4).
3. **Add platform → Website** if none exists.
4. Site URL:

```text
https://diamond-tip-tattoo.web.app/
```

5. **Settings → Basic → App domains** add:

```text
diamond-tip-tattoo.web.app
diamond-tip-tattoo.vercel.app
```

6. Save changes.

---

## Step 3 — Configure the webhook (Meta screen “1. Configure webhooks”)

1. Messenger API Settings → **Configure webhooks** / **Add callback URL**.
2. Fill:

| Field | Value |
|------|--------|
| **Callback URL** | `https://diamond-tip-tattoo.vercel.app/api/meta/webhook` |
| **Verify token** | Must match Vercel `META_VERIFY_TOKEN` |

Recommended verify token (already the default in code; Vercel already has one set):

```text
diamond_tip_messenger_verify_2026
```

3. **Before** clicking Verify in Meta, confirm Vercel:

   Vercel → Diamond Tip project → **Settings → Environment Variables**

   | Name | Value |
   |------|--------|
   | `META_VERIFY_TOKEN` | same string as the Meta verify token |

   Production **and** Preview. Redeploy if you change it.

4. Back in Meta, click **Verify and save**.
   - Success → saved.
   - Fail → open https://diamond-tip-tattoo.vercel.app/api/meta/status and check `META_VERIFY_TOKEN` is `"set"`. No trailing slash on the callback URL.

5. **Subscribe to webhook fields:**

   - [x] `messages`
   - [x] `messaging_postbacks`
   - [x] `messaging_optins`
   - [x] `messaging_referrals`
   - [x] `message_deliveries` (optional)

   Save.

---

## Step 4 — Connect the Page and generate the token

Still under Messenger API Settings:

1. **Add / connect Page** → **Diamond Tip Tattoo** (must be a Page, not a personal profile).
2. Accept permissions (manage/respond to messages).
3. **Generate** token for that Page. Copy the long string.
4. Copy **App secret**: Settings → Basic → App secret → Show.
5. Put these in Vercel → Environment Variables (Production + Preview):

   | Name | Value |
   |------|--------|
   | `META_PAGE_ACCESS_TOKEN` | *(paste Page token)* |
   | `META_APP_SECRET` | *(paste App secret)* |
   | `META_PAGE_ID` | *(optional — Page ID if shown)* |
   | `META_APP_ID` | *(optional — your numeric App ID)* |

6. Redeploy Vercel.

7. Refresh:

```text
https://diamond-tip-tattoo.vercel.app/api/meta/status
```

`META_PAGE_ACCESS_TOKEN` should read `set (xxxxxx…yyyy)`.

---

## Step 5 — Register yourself so forms can message you

Meta will not let the Page message people who have never talked to it.

1. On your phone, open Messenger and message the Page, or open https://m.me/diamondtiptattoo
2. Send exactly:

```text
notify me
```

3. If the webhook is live, the bot replies with **your PSID** (a long number).
4. Or check **Vercel → Project → Logs** for:

```json
{"event":"messenger_inbound","psid":"1234567890"}
```

5. Vercel env:

   | Name | Value |
   |------|--------|
   | `MESSENGER_NOTIFY_PSIDS` | `1234567890` |

   Several people (Steven, Scotty, you):

   ```text
   111111,222222,333333
   ```

   Each person must message the Page once (or send `notify me`).

6. **App roles** (dev mode): App → **Roles** → add Admins / Developers / Testers for anyone who must receive bot messages. They accept the invite.

7. Redeploy.

`/api/meta/status` should show `"configured": true`.

---

## Step 6 — Allowlist the website for messaging

In the app:

1. Messenger API Settings (or **Settings → Advanced** / **App domains** as Meta currently labels it).
2. Add the site origin if there is a **Whitelisted domains** field:

```text
https://diamond-tip-tattoo.web.app
https://diamond-tip-tattoo.vercel.app
```

3. Page **Settings → Messaging**: messaging is **On**.

---

## Step 7 — Test the booking form

The site already posts the form to Vercel (`<meta name="dtt-form-api">` points at `https://diamond-tip-tattoo.vercel.app`).

1. Open https://diamond-tip-tattoo.web.app/#book (after this change is deployed to Firebase).
2. Submit a **test** consultation (your real email so you can recognise it).
3. You should get:
   - A Messenger message on the Page thread with the form details (name, email, idea, date).
   - A browser window/tab to `m.me/diamondtiptattoo?ref=booking_…`
   - An auto-reply to the customer once they start that chat.
4. Check **Facebook Page Inbox** / Meta Business Suite.
5. Confirm the booking still appears in the studio CRM portal.

---

## Checklist

- [ ] App opened; **Messenger from Meta** use case added
- [ ] App ID pasted into `index.html` `<meta name="facebook-app-id">`
- [ ] Website + app domains saved
- [ ] Webhook URL verified: `https://diamond-tip-tattoo.vercel.app/api/meta/webhook`
- [ ] Subscribed: messages, postbacks, referrals
- [ ] Page connected; Page token generated
- [ ] Vercel env: `META_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN`, `META_APP_SECRET`
- [ ] Messaged Page `notify me` → got PSID
- [ ] Vercel env: `MESSENGER_NOTIFY_PSIDS`
- [ ] `/api/meta/status` → `"configured": true`
- [ ] Test booking appears in Messenger

---

## What not to pick in “Add use cases”

| Skip | Why |
|------|-----|
| Create & manage ads / Marketing API | Ads, not form inbox |
| Facebook Login only | Logins, not Page messaging |
| WhatsApp | Different product |
| Create an app without a use case | Harder later |

---

## Common errors

| Symptom | Fix |
|---------|-----|
| Webhook verification failed | `META_VERIFY_TOKEN` mismatch, or URL typo / trailing slash |
| Token set but no messages | Empty `MESSENGER_NOTIFY_PSIDS`, or that person never messaged the Page |
| `(#10) permission denied` | User not admin/tester of the app, or Page not connected |
| `(#551) person not available` | Outside messaging window — send `notify me` again from that Facebook account |
| Forms don’t hit API | Site not deployed with `dtt-form-api` pointing at Vercel |
| Works for you, not staff | Dev mode — add them as tester, or later submit App Review |

---

## After each step, paste back here

1. `Webhook verified` / `Webhook failed: ________`
2. Status JSON from https://diamond-tip-tattoo.vercel.app/api/meta/status
3. `Got PSID: ________`
4. `Token screen error: ________`
5. `Test form sent — no Messenger message`
6. `Ready for App Review / go live`

---

## Security

- Never commit tokens to GitHub.
- Only put secrets in **Vercel Environment Variables**.
- Rotate the Page token if it ever leaks.
- Keep `META_APP_SECRET` set so webhook signatures are checked.
