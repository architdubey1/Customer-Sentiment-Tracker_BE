# Option 1: ElevenLabs Post-Call Webhook — Step-by-Step Setup

Your backend already has the endpoint **`POST /webhooks/elevenlabs-post-call`** that accepts post-call audio from ElevenLabs and saves it to S3, then links it to the chat. Follow these steps to enable it.

---

## Step 1: Run your backend

From the backend folder:

```bash
cd Customer-Sentiment-Tracker_BE
npm run dev
```

Leave this running. The server must be reachable by ElevenLabs (see Step 2). If you deploy instead, the host runs the server — no local run needed for the webhook.

---

## Step 2: Expose your backend with a public URL

ElevenLabs needs to call your server from the internet. You can do this **without ngrok** by deploying the backend.

### Option A – Deploy the backend (recommended, no tunnel)

Deploy your Node backend to a host that gives you an HTTPS URL. No tunnel or ngrok needed.

- **Render** (free tier): [render.com](https://render.com) → New → Web Service → connect repo, set build command `npm install`, start command `npm start` (or `node server.js`). Set env vars (e.g. MongoDB, AWS, ElevenLabs) in the dashboard. Use the URL Render gives you (e.g. `https://your-app.onrender.com`).
- **Railway** (free tier): [railway.app](https://railway.app) → New Project → Deploy from GitHub → same idea: add env vars, use the generated URL.
- **Fly.io**, **Heroku**, etc.: same idea — deploy the backend, add environment variables, use the app’s HTTPS URL.

Your webhook URL will be:

```text
https://YOUR_DEPLOYED_APP_URL/webhooks/elevenlabs-post-call
```

Example: `https://customer-sentiment-api.onrender.com/webhooks/elevenlabs-post-call`

### Option B – Local tunnel (if you must run locally)

If you prefer to run the backend on your machine and still need a public URL, use a tunnel (e.g. [ngrok](https://ngrok.com/download) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps)). Then use that tunnel’s HTTPS URL as `YOUR_PUBLIC_BASE_URL` in the webhook URL above.

---

## Step 3: Configure the webhook in ElevenLabs

1. Log in to [ElevenLabs](https://elevenlabs.io).
2. Go to **Conversational AI** (or **Agents** / **Phone** — the place where you configure your phone agent).
3. Find **Webhooks** or **Post-call** / **Post-conversation** settings.
4. Add a **Post-call** (or “After call”) webhook:
   - **URL:** `https://YOUR_PUBLIC_BASE_URL/webhooks/elevenlabs-post-call`
   - Enable **post-call audio** (or “send recording” / “include audio”) so the request body includes the call audio (e.g. base64).
5. Save the configuration.

If the exact menu names differ (e.g. “Workflows”, “Integrations”), look for anything that says “webhook after call” or “post-call” and use the same URL.

---

## Step 4: Ensure `chat_id` is sent when starting a call

Your app already passes `chat_id` in `dynamic_variables` when starting a call so the webhook can match the audio to the correct chat. No change needed unless you added a different flow; then make sure that flow also sends `chat_id` in the same way.

---

## Step 5: Test

1. Start a **real phone call** through your app (Voice Bot or Priority Queue).
2. Talk for a few seconds, then **hang up**.
3. Wait **about 1–2 minutes** (ElevenLabs may take a short time to process and send the webhook).
4. Open **Call Log** in your app and find the call you just made.
5. Click that chat:
   - You should see the **audio player** and be able to **play the recording**.
   - If the recording doesn’t appear, check the next step.

---

## Step 6: If the recording doesn’t appear

1. **Backend logs**  
   When ElevenLabs sends the webhook, the backend logs something like:  
   `ElevenLabs webhook: received post-call` and either `saved recording for chat ...` or a warning (`no_audio`, `no_chat`, etc.). Check your terminal/logs for these.

2. **Payload shape**  
   The first log line includes the **keys** of the incoming JSON. If ElevenLabs uses different field names for audio or `chat_id`, we can adjust the controller to read those. Share the payload keys (or a redacted sample) and we can update the code.

3. **URL and HTTPS**  
   Confirm the webhook URL is correct, uses **HTTPS**, and that your backend is running and reachable at that URL (e.g. `curl -X POST https://YOUR_URL/webhooks/elevenlabs-post-call -H "Content-Type: application/json" -d '{}'` should hit your server).

---

## Summary checklist

- [ ] Backend running (locally with `npm run dev` or deployed)
- [ ] Public URL set up (deployed app recommended; or a tunnel if running locally)
- [ ] Webhook URL in ElevenLabs: `https://YOUR_PUBLIC_BASE_URL/webhooks/elevenlabs-post-call`
- [ ] Post-call audio enabled in ElevenLabs
- [ ] Test call placed → hang up → wait 1–2 min → check Call Log for recording

Once these are done, Option 1 is fully in use: recordings come from ElevenLabs after each call and are stored in S3 and linked to the chat, without using Twilio recording.

---

## Post-call transcription (accurate transcript in Call Log)

To get the **conversation transcript** (same source as the Test page) saved to the chat and shown in Call Log, enable the **post-call transcription** webhook in ElevenLabs and point it to your backend. See **[ELEVENLABS_POST_CALL_TRANSCRIPTION.md](./ELEVENLABS_POST_CALL_TRANSCRIPTION.md)** for setup and URL.
