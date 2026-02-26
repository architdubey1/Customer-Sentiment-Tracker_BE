# Call recording

## Option 1: ElevenLabs post-call webhook (works without Twilio recording / trial)

**Use this if Twilio trial doesn’t allow recording.** ElevenLabs can send the call audio to your backend when the call ends.

### Backend

- Endpoint: `POST /webhooks/elevenlabs-post-call` (no auth).
- When you start a call, we send `chat_id` to ElevenLabs so the webhook can link the audio to the right chat. If the webhook doesn’t include `chat_id`, we fall back to matching by `called_number` and the latest chat without a recording.

### In ElevenLabs

1. Log in at [elevenlabs.io](https://elevenlabs.io).
2. Go to **Conversational AI** → your agent (or **Settings** / **Workflows**).
3. Find **Post-call webhooks** or **Workflows** → **Post-call**.
4. Add a webhook:
   - **URL:** `https://YOUR_BACKEND_URL/webhooks/elevenlabs-post-call`  
     (e.g. `https://your-app.fly.dev/webhooks/elevenlabs-post-call` or ngrok for local.)
   - **Event / type:** enable **Post-call audio** (so the payload includes the base64 audio).
5. Save. After each call, ElevenLabs will POST the audio to this URL; the backend will upload it to S3 and set the chat’s recording.

### Deploy or expose backend

ElevenLabs must reach your backend. Use either:

- A **deployed** backend (e.g. Render, Railway, Fly.io) and set the webhook URL to `https://your-domain/webhooks/elevenlabs-post-call`, or  
- **ngrok** (or similar) for local: `ngrok http 5001` and set the webhook URL to `https://xxx.ngrok.io/webhooks/elevenlabs-post-call`.

---

## Option 2: Twilio support call recording (Create a Recording API)

The backend uses **Twilio’s supported “Create a Recording” flow** for support calls: we start a recording on the live call as soon as the call is created.

- **API:** [Create a Recording](https://www.twilio.com/docs/voice/api/recording#create-a-recording) — `POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}/Recordings.json`
- **Behavior:** “To start a recording on a live call, make a POST request to the Recordings subresource of an in-progress Call. A recording can be as long as the call.”
- No TwiML or `<Record>` in the dial flow is required; we call the API right after we have the Call SID.

- When you start a phone call (Voice Bot or Priority Queue), we get the Twilio Call SID from ElevenLabs and immediately call Twilio to start a recording on that call.
- If `WEBHOOK_BASE_URL` is set in `.env` (e.g. `https://xxx.ngrok.io` or your deployed URL), we pass `RecordingStatusCallback` so Twilio POSTs to `/webhooks/twilio-recording` when the recording is completed; the webhook then downloads the file and uploads to S3.
- If `WEBHOOK_BASE_URL` is not set, the recording still starts; the **Twilio recording poller** (`TWILIO_RECORDING_POLLING=true`) will find the recording when the call ends and upload it to S3.

**Requirements:** `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `.env`. Your Twilio account must allow creating recordings (trial accounts may have restrictions).

---

## Option 3: Twilio polling (fallback when no callback URL)

## Option A: Polling (no webhook, no ngrok)

Set in `.env`:

- `TWILIO_RECORDING_POLLING=true`
- `TWILIO_RECORDING_POLL_INTERVAL_MINUTES=3`
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`

The backend will periodically ask Twilio for recordings for each chat that has a `callSid` but no recording yet, then download and upload to S3.

**You must enable recording for the call** in Twilio or ElevenLabs so Twilio actually creates a recording. If you see "no_recordings" when debugging, the call was not recorded by Twilio.

**Debug:** Call `POST /api/chats/poll-recordings` (with auth). Response example:

```json
{
  "processed": 0,
  "details": [
    { "chatId": "...", "callSid": "CAxxxx", "status": "no_recordings" }
  ]
}
```

- `no_recordings` = Twilio has no recording for this Call SID (enable recording for the number/call).
- `twilio_error` = Twilio API error (check credentials / Call SID).
- `uploaded` = recording was downloaded and saved to S3.

---

## Option B: Webhook (needs public URL)

When a call is recorded by Twilio, Twilio can POST to this app so the recording is downloaded, uploaded to S3, and linked to the chat in Call Log.

## 1. Backend env

In `.env` set:

- `TWILIO_ACCOUNT_SID` – from [Twilio Console](https://console.twilio.com)
- `TWILIO_AUTH_TOKEN` – from Twilio Console

(S3 and AWS vars must already be set for uploads to work.)

## 2. Webhook URL

Your backend must be reachable by Twilio (e.g. deployed with a public URL or use ngrok for local dev).

Webhook URL to give Twilio:

```text
https://YOUR_BACKEND_HOST/webhooks/twilio-recording
```

Example (production): `https://api.yourapp.com/webhooks/twilio-recording`  
Example (local with ngrok): `https://abc123.ngrok.io/webhooks/twilio-recording`

## 3. Configure Twilio to record and call the webhook

You need Twilio to:

1. **Record** the call (e.g. `record="record-from-answer"` in TwiML, or Recording API).
2. **Call your webhook** when the recording is ready (Recording Status Callback).

Where this is set depends on how the call is created:

- **If you control the TwiML** (e.g. your own Twilio app), add something like:
  ```xml
  <Record recordingStatusCallback="https://YOUR_BACKEND_HOST/webhooks/twilio-recording" />
  ```
- **If ElevenLabs / Conversational AI creates the call**, check the ElevenLabs (and Twilio) docs for “recording” and “status callback” so the Twilio call is created with recording + `recordingStatusCallback` pointing to the URL above. You may need to configure this in the ElevenLabs dashboard or in the Twilio number’s webhook URL.

## 4. Flow

1. User starts a call → backend creates a **Chat** and stores Twilio **Call SID** in `metadata.callSid`.
2. Call ends and Twilio finishes the recording.
3. Twilio POSTs to `/webhooks/twilio-recording` with `CallSid`, `RecordingSid`, `RecordingStatus=completed`.
4. Backend finds the Chat by `metadata.callSid`, downloads the recording from Twilio (with Account SID + Auth Token), uploads to S3, and sets `recordingS3Key` on the chat.
5. In Call Log, when the user selects that chat, the app fetches the presigned playback URL and plays the recording.
