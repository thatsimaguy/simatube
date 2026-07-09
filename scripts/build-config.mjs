import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "config.example.js",
  "manifest.webmanifest",
  "app-icon.svg",
  "apple-touch-icon.png",
  "service-worker.js",
];
const googleOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const googleOAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const config = {
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  googleOAuthClientId,
  serverOAuthEnabled: Boolean(googleOAuthClientId && googleOAuthClientSecret),
  regionCode: process.env.YOUTUBE_REGION_CODE || "US",
  maxSubscriptionChannels: numberFromEnv("YOUTUBE_MAX_SUBSCRIPTION_CHANNELS", 50),
  uploadsPerChannel: numberFromEnv("YOUTUBE_UPLOADS_PER_CHANNEL", 2),
};

await rm(dist, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
await mkdir(dist, { recursive: true });

await Promise.all(files.map((file) => cp(new URL(file, root), new URL(file, dist))));
await writeFile(
  new URL("config.runtime.js", dist),
  `window.YT_APP_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
);
