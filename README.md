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
| `ANTHROPIC_API_KEY` | your sk-ant-... key |
| `REPLICATE_API_KEY` | your r8_... key |
| `HUBSPOT_ACCESS_TOKEN` | your pat-na1-... token |

> Note: The current version accepts keys via the browser setup screen for easy testing.
> For production, you'll want a simple serverless function to proxy the API calls securely.

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
3. Copy the access token

**Create these custom contact properties in HubSpot:**
- `contact_type__breven_` (Single-line text)
- `desired_location` (Single-line text)
- `square_footage` (Number)
- `finish_level` (Single-line text)
- `build_timeline` (Single-line text)

---

## API Keys Cost Estimate

| Service | Monthly Cost |
|---|---|
| Anthropic (Claude) | ~$10–20/mo typical usage |
| Replicate (images) | ~$0.01/image, pay as you go |
| HubSpot | Free CRM tier works fine |
| Vercel hosting | Free |
| **Total** | **~$15–25/mo** |
