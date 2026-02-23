# AI Customer Sentiment Tracker — Early Warning System

An intelligent Node.js backend that monitors customer support emails, analyzes sentiment using Google Gemini AI, assigns priority scores, and alerts your team to critical issues before they escalate.

## Features

- **Gmail Integration** — Automatically polls support inbox for new customer emails
- **AI Sentiment Analysis** — Gemini 2.5 Flash classifies sentiment (positive/negative/neutral/mixed) with a -1 to +1 score
- **Priority Scoring** — Composite formula weighing severity, frequency, urgency keywords, and sentiment trend
- **Customer Tracking** — Auto-creates customer profiles, tracks feedback history and sentiment trends per user
- **Critical Alerts** — Slack webhook notifications for high-priority feedback
- **Auto-Reply** — Automatically responds to critical emails acknowledging the concern
- **PII Encryption** — AES-256-GCM encryption for customer email addresses and names at rest
- **Dashboard Stats** — Aggregated analytics (sentiment breakdown, priority distribution, daily trends, top complainers)
- **API Key Auth** — Optional header-based API authentication
- **Rate Limiting** — Per-IP request throttling to prevent abuse

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** MongoDB (Mongoose ODM)
- **AI:** Google Gemini 2.5 Flash
- **Email:** Gmail API (OAuth2)
- **Validation:** Zod
- **Logging:** Winston + Morgan
- **Scheduling:** node-cron

## Project Structure

```
├── config/              # Database, Gemini AI, Gmail OAuth config
├── constants/           # Sentiment types, priority levels, HTTP status codes
├── controllers/         # Request handling (sentiment, mail, stats, customers)
├── database/models/     # Mongoose schemas (Feedback, Customer)
├── logs/                # Winston logger + log files
├── middlewares/          # Error handler, validator, rate limiter, API key auth
├── routes/              # Express route definitions
├── scripts/             # Gmail OAuth token helper
├── tools/               # Gemini analyzer, mail scanner, cron poller, alert service
├── utils/               # Response helpers, async handler, priority calculator, encryption
├── validators/          # Zod input schemas
├── server.js            # Application entry point
├── .env.example         # Environment variable template
└── .env                 # Environment variables (not committed)
```

## Setup

### Prerequisites

- Node.js >= 18
- MongoDB instance (local or Atlas)
- Google Gemini API key
- Gmail API OAuth2 credentials

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5001) |
| `MONGO_URI` | Yes | MongoDB connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GMAIL_CLIENT_ID` | Yes | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Yes | Gmail OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Yes | Gmail OAuth refresh token |
| `AUTOMATE_POLLING` | No | `true` to enable cron email polling |
| `POLL_INTERVAL_MINUTES` | No | Polling interval (default: 5) |
| `AUTO_REPLY_ENABLED` | No | `true` to auto-reply to critical emails |
| `API_KEY` | No | API key for endpoint protection (blank = disabled) |
| `ENCRYPTION_KEY` | No | 32-byte hex key for PII encryption (blank = disabled) |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook for critical alerts |

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Gmail OAuth Setup

```bash
node scripts/getGmailToken.js
```

Follow the prompts to authorize your support email account and obtain a refresh token.

### Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

## API Endpoints

### Health Check

```
GET /health
```

### Sentiment Analysis

```
POST /api/sentiment/analyze
Content-Type: application/json

{ "text": "The product quality is amazing!" }
```

Response includes sentiment, score, urgency, keywords, and priority.

### List Feedback

```
GET /api/sentiment
GET /api/sentiment?sentiment=negative&sortBy=priority&page=1&limit=20
```

Query params: `sentiment`, `priority`, `sortBy` (createdAt | priority), `page`, `limit`

### Get Feedback by ID

```
GET /api/sentiment/:id
```

### Priority Queue

Returns critical + high priority feedback sorted by urgency, with summary counts.

```
GET /api/sentiment/priority
GET /api/sentiment/priority?level=critical
```

### Trigger Email Scan

```
POST /api/mail/scan
POST /api/mail/scan?limit=20
```

### Dashboard Stats

```
GET /api/stats
```

Returns: total count, sentiment breakdown, priority breakdown, daily trend (30 days), top 10 repeat complainers, source breakdown.

### Customers

```
GET /api/customers
GET /api/customers?sortBy=sentiment&page=1&limit=20
GET /api/customers/:id
```

Customer detail includes full feedback history.

## Priority Scoring

Each feedback item receives a 0-100 priority score based on four weighted signals:

| Signal | Weight | Description |
|--------|--------|-------------|
| Severity | 35% | Sentiment score normalized (more negative = higher) |
| Frequency | 30% | Negative emails from same sender in last 7 days |
| Urgency | 20% | AI-detected urgency level (critical/high/moderate/low) |
| Trend | 15% | Customer sentiment worsening vs their historical average |

**Priority tiers:** critical (75-100), high (50-74), medium (25-49), low (0-24)

## Security

- **API Key Auth** — Set `API_KEY` in `.env`; all requests must include `x-api-key` header
- **Rate Limiting** — 100 requests per 15 min (general), 5 scans per minute (mail endpoint)
- **PII Encryption** — AES-256-GCM field-level encryption for customer names and emails
- **Input Validation** — Zod schemas on all POST endpoints

## Error Handling

All errors return a consistent JSON shape:

```json
{
  "success": false,
  "message": "...",
  "errors": ["..."]
}
```

| Code | Meaning |
|------|---------|
| 401 | Missing or invalid API key |
| 404 | Route or resource not found |
| 422 | Validation error |
| 429 | Rate limit exceeded |
| 503 | Gemini API unavailable |
| 500 | Unhandled server error |

## License

MIT
