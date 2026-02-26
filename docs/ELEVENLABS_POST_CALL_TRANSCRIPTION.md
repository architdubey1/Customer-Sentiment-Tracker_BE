# ElevenLabs Post-Call Transcription Webhook

The backend exposes **`POST /webhooks/elevenlabs-post-call-transcription`** so ElevenLabs can send the **conversation transcript** after each phone call. This gives you the same accurate transcript source as the Test page (ElevenLabs’ own ASR/agent), shown in Call Log below the recording.

---

## How it works

1. When you start a phone call, the backend creates a Chat and passes **`chat_id`** in `dynamic_variables` to ElevenLabs.
2. After the call ends, ElevenLabs can send a **post-call transcription** webhook with the full conversation (user/agent messages and optional timestamps).
3. The webhook finds the Chat by `chat_id` (or by `called_number` as fallback), normalizes the transcript to `[{ speaker: 'agent'|'user', text, time }]`, and saves it to `chat.transcript`.
4. Call Log loads this transcript and displays it below the recording; timestamps are clickable to seek the audio.

---

## Setup

### 1. Public URL

Same as the post-call **audio** webhook: your backend must be reachable at an HTTPS URL (deployed app or tunnel). See [ELEVENLABS_POST_CALL_SETUP.md](./ELEVENLABS_POST_CALL_SETUP.md) for options.

### 2. Enable the webhook in ElevenLabs

1. Log in to [ElevenLabs](https://elevenlabs.io).
2. Go to **Conversational AI** (or **Agents** / **Phone**) and open **Webhooks** / **Post-call** settings.
3. Add a **Post-call transcription** webhook (separate from the audio webhook):
   - **URL:** `https://YOUR_PUBLIC_BASE_URL/webhooks/elevenlabs-post-call-transcription`
   - Example: `https://your-app.onrender.com/webhooks/elevenlabs-post-call-transcription`
4. Enable **Post-call transcription** (or equivalent) so ElevenLabs sends the transcript to this URL after each call.
5. Save.

### 3. `chat_id` when starting the call

The app already sends `chat_id` in `dynamic_variables` when starting a call (`startPhoneCall` / `callCustomer`). The transcription webhook uses this to attach the transcript to the correct Chat. No code change needed.

---

## Payload handling

The handler accepts the usual ElevenLabs post-call transcription payload (aligned with their GET Conversation / post_call_transcription format). It looks for transcript data in:

- `data.transcript`
- `data.messages`
- `data.conversation.transcript` / `data.conversation.messages`
- `data.analysis.transcript`

Each item can have:

- **Text:** `text`, `message`, or `content`
- **Speaker:** `role` or `speaker` (`user` → user, anything else → agent)
- **Time:** `start`, `start_time`, or `start_s` (seconds) → converted to `"MM:SS"`

If ElevenLabs changes the payload shape, we can extend `extractTranscriptFromPayload` in `controllers/elevenLabsWebhookController.js` to support more fields.

---

## Testing

1. Place a **phone call** from the app (Voice Bot or Priority Queue).
2. Talk for a short time, then hang up.
3. Wait for ElevenLabs to process (often 1–2 minutes).
4. Open **Call Log**, select the call:
   - You should see the **transcript** below the recording (Agent/User bubbles, optional timestamps).
   - If you also use the **post-call audio** webhook, the recording will be there; transcription can arrive before or after the audio webhook.

If the transcript does not appear, check backend logs for:

- `ElevenLabs webhook: received post-call-transcription` — webhook was received.
- `ElevenLabs transcription webhook: no matching chat` — `chat_id` or `called_number` did not match any Chat.
- `ElevenLabs transcription webhook: no transcript in payload` — payload had no transcript array; we may need to support a different payload shape.

---

## Summary

- **Endpoint:** `POST /webhooks/elevenlabs-post-call-transcription` (no auth).
- **Purpose:** Store ElevenLabs’ post-call transcript on the Chat so Call Log can show it.
- **ElevenLabs:** Enable “Post-call transcription” and set the URL to your backend’s transcription webhook.
