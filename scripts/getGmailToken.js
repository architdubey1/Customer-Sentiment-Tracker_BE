require("dotenv").config();

const { google } = require("googleapis");
const http = require("http");
const url = require("url");

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n=== Gmail OAuth Setup ===\n");
console.log("1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Sign in with your SUPPORT email account");
console.log("3. Grant the requested permissions\n");

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname !== "/api/auth/callback/google") return;

  const query = parsed.query;

  if (query.code) {
    try {
      const { tokens } = await oauth2Client.getToken(query.code);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Success! You can close this tab.</h1>");

      console.log("=== Token received ===\n");
      console.log("Update your .env with this refresh token:\n");
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);

      server.close();
      process.exit(0);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<h1>Error: ${err.message}</h1>`);
      console.error("Token exchange failed:", err.message);
    }
  }
});

server.listen(3000, () => {
  console.log("Waiting for OAuth callback on http://localhost:3000 ...\n");
});
