/**
 * S3 config and helpers for chat recordings.
 * Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET in .env.
 */
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Readable } = require("stream");

const region = process.env.AWS_REGION || "us-east-1";
const bucket = process.env.S3_BUCKET || "";

let s3Client = null;

function getS3() {
  if (!bucket) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return s3Client;
}

/**
 * Upload a buffer to S3. Returns the S3 key.
 * @param {string} key - S3 object key (e.g. recordings/abc123.mp3)
 * @param {Buffer} body - File body
 * @param {string} contentType - e.g. 'audio/mpeg'
 */
async function uploadToS3(key, body, contentType = "audio/mpeg") {
  const client = getS3();
  if (!client) throw new Error("S3 not configured (S3_BUCKET and AWS credentials)");
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Get a presigned URL for playback (GET). Expires in 1 hour by default.
 */
async function getPresignedPlaybackUrl(key, expiresIn = 3600) {
  const client = getS3();
  if (!client) throw new Error("S3 not configured");
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Read object from S3 and return as Buffer (e.g. for transcription).
 */
async function getObjectBuffer(key) {
  const client = getS3();
  if (!client) throw new Error("S3 not configured");
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(command);
  const stream = response.Body;
  if (!(stream instanceof Readable)) throw new Error("Unexpected S3 response body");
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = {
  getS3,
  uploadToS3,
  getPresignedPlaybackUrl,
  getObjectBuffer,
  bucket,
  isConfigured: Boolean(bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
};
