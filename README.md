# Breven Homes Chat Assistant — Deployment Guide

## What This Does
- Greets visitors and routes vendor vs. homeowner leads
- Collects contact info and saves to HubSpot automatically
- Generates a high/low cost estimate based on sq ft and finish level
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
| `HUBSPOT_TASK_OWNER_ID` | `162307683` (Bryan Byrnes; optional default) |
| `HUBSPOT_CHAT_EVENT_PROPERTY` | `bh_chat_inquiry_at` after creating this contact property |

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

The server creates a task associated with the contact when the visitor first provides an email or phone. It assigns the task to Bryan Byrnes and gives it a due date 24 hours later. Later messages update the same contact in the browser session without creating a task each turn. If a visitor returns in a new session, a new inquiry can produce a new task.

To send the internal alert from HubSpot:

1. Create a **contact** property with internal name `bh_chat_inquiry_at`, type **Date and time**. Set `HUBSPOT_CHAT_EVENT_PROPERTY=bh_chat_inquiry_at` in Vercel and redeploy. The code writes a fresh timestamp for each new chat inquiry.
2. Create a **contact-based workflow**. Use an event enrollment trigger **Property value changed** for `bh_chat_inquiry_at`. Enable re-enrollment on this event, so an existing contact can generate another alert on a later visit. Add **Send internal email notification** addressed to the active HubSpot users Bryan Byrnes, Steven Byrnes, and Melinda Blackmon. Turn on the workflow for future enrollments. The available actions depend on your HubSpot subscription.
3. Test with a fresh chat using a contact you control. Check the contact's property history, workflow enrollment history, the associated task, and each recipient's notification settings and inbox. Test a second visit with the same email to verify re-enrollment.

The `/api/hubspot` response reports contact save, task creation, and workflow event update separately. A successful event property update proves only that HubSpot accepted the trigger property; verify the workflow and email delivery in HubSpot. If the property is missing, contact and task creation can still succeed, but the response reports a workflow event failure.

**Production hardening:** The public HubSpot endpoint needs a bot challenge and rate limit before promoting it broadly. Restrict browser origins and add server-side request validation; CORS alone is not an authentication or abuse control. Review chatbot cost estimates with current Breven pricing, since the figures in `index.html` are hard-coded.

---

## API Keys Cost Estimate

| Service | Monthly Cost |
|---|---|
| Anthropic (Claude) | ~$10–20/mo typical usage |
| Replicate (images) | ~$0.01/image, pay as you go |
| HubSpot | Free CRM tier works fine |
| Vercel hosting | Free |
| **Total** | **~$15–25/mo** |
