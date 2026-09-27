# Breven Homes Chat Assistant — Deployment Guide

## What This Does
- Greets visitors and routes vendor vs. homeowner leads
- Collects contact info and saves to HubSpot automatically
- Generates a preliminary $300–$400 per square foot range from the extracted square footage
- Creates an AI rendering of their dream home (via Replicate)

---

## Deploy to Vercel in 5 Minutes

### Step 1: Create a GitHub repo
1. Go to github.com → New repository → name it `breven-chat`
2. Upload `index.html` to the repo

### Step 2: Deploy on Vercel
1. Go to vercel.com → Add New Project
2. Import your GitHub repo
3. Click Deploy — done, it's live

### Step 3: Add your API keys (secure method)
In Vercel dashboard → Your project → Settings → Environment Variables:

| Key Name | Value |
|---|---|
| `OPENAI_API_KEY` | server-side OpenAI API key |
| `REPLICATE_API_KEY` | your r8_... key |
| `HUBSPOT_ACCESS_TOKEN` | your pat-na1-... token |
| `HUBSPOT_TASK_OWNER_ID` | `168491860` (Melinda Blackmon; optional default) |
| `HUBSPOT_CHAT_EVENT_PROPERTY` | Optional override; defaults to `bh_chat_inquiry_at` |
| `CONSULTATION_BOOKING_URL` | Optional override; defaults to Melinda's verified calendar URL |
| `RESEND_API_KEY` | Resend sending API key, stored as a Vercel Secret |
| `LEAD_ALERT_FROM` | Verified sender such as `Breven Homes <chat@notify.brevenhomes.com>` if that sending subdomain is verified |
| `LEAD_ALERT_TO` | Comma-separated work email addresses for Bryan, Steven, and Melinda (set in Vercel, not in GitHub) |

Keys are read by the serverless functions and must never be placed in browser code.

---

## Embed in Webflow

Once deployed, you'll get a URL like `breven-chat.vercel.app`.

**Option A — Full page popup:**
Add this to your GET IN TOUCH button's click interaction in Webflow:
```html
<script>
function openChat() {
  window.open('https://your-chat.vercel.app', 'BrevenChat', 
    'width=700,height=650,scrollbars=no');
}
</script>
```
Set the button's onclick to `openChat()`

**Option B — Embedded iframe popup:**
Add a Webflow interaction that shows a div containing:
```html
<iframe src="https://your-chat.vercel.app" 
  width="100%" height="100%" frameborder="0">
</iframe>
```

---

## HubSpot Setup

1. In HubSpot → Settings → Integrations → Private Apps
2. Create a new Private App with these scopes:
   - `crm.objects.contacts.write`
   - `crm.objects.contacts.read`
   - The task creation endpoint uses the contact write scope for tasks associated with contacts.
3. Copy the access token

**Create these custom contact properties in HubSpot:**
- `contact_type__breven_` (Single-line text)
- `desired_location` (Single-line text)
- `square_footage` (Number)
- `finish_level` (Single-line text)
- `build_timeline` (Single-line text)
- `project_notes` (Multi-line text)

### New website chat follow-up

The server creates a task associated with the contact when the visitor first provides an email or phone. It assigns the task to Melinda Blackmon and gives it a due date 24 hours later. Later messages update the same contact in the browser session without creating a task each turn. If a visitor returns in a new session, a new inquiry can produce a new task.

The chat transcript is saved as a single HubSpot Note associated with the contact and refreshed after each turn. **Finish chat** marks the Note completed. The browser also attempts a final update when the page closes; because browsers can interrupt that request, the last successfully saved turn remains in the Note even if the final request fails. This includes the visitor and assistant messages; AI control markers for estimates and renderings are removed. A chat without an email or phone cannot be attached to a contact.

After a potential homeowner shares contact details, the chat shows **Book a consultation**. It opens Melinda's calendar at `https://meetings-na2.hubspot.com/melinda-blackmon`, which was verified to display available times. `CONSULTATION_BOOKING_URL` can override this default if the calendar changes. If the configured URL is invalid, the button becomes **Request a consultation**, records that request in the transcript Note, and leaves the follow-up task with Melinda.

### Email alerts without a paid HubSpot workflow

The chatbot sends one internal lead alert directly through Resend after saving the contact in HubSpot. The alert contains the contact's submitted details and a link to the contact; the full conversation stays in the HubSpot Note. The `bh_chat_inquiry_at` property records when a new chat inquiry was submitted and does not require a workflow.

1. Create a free Resend account and verify a sending domain you control, following Resend's DNS instructions. You can use a dedicated sending subdomain to keep its DNS records separate from existing mail.
2. Create a sending API key in Resend. Set `RESEND_API_KEY` as a **Secret** and `LEAD_ALERT_FROM` and `LEAD_ALERT_TO` in the Vercel project's Production environment. Do not put the API key in GitHub or browser code. Redeploy after adding the variables.
3. Confirm the HubSpot contact property `bh_chat_inquiry_at` exists as a Date and time field. This was created in the Breven portal on September 27, 2026.
4. Test with a fresh chat using contact details you control. Confirm the associated task belongs to Melinda, the Note contains the chat, the inquiry timestamp changes, and all three internal addresses receive the alert. Test a second visit with the same email.

The `/api/hubspot` response reports contact save, task creation, Note save, inquiry timestamp update, and email API acceptance separately. Resend acceptance does not guarantee inbox delivery; check its delivery log and recipient inboxes. Missing email configuration does not block contact or task creation, but the response reports an email alert failure.

**Production hardening:** The public HubSpot endpoint needs a bot challenge and rate limit before promoting it broadly. Restrict browser origins and add server-side request validation; CORS alone is not an authentication or abuse control. The $300–$400 per square foot estimate in `index.html` is intentionally hard-coded until Breven changes it.

---

## API Keys Cost Estimate

| Service | Monthly Cost |
|---|---|
| Anthropic (Claude) | ~$10–20/mo typical usage |
| Replicate (images) | ~$0.01/image, pay as you go |
| HubSpot | Free CRM tier works fine |
| Vercel hosting | Free |
| **Total** | **~$15–25/mo** |
