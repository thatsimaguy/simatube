const crypto = require("node:crypto");

const READ_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SESSION_COOKIE = "yt_server_session";
const STATE_COOKIE = "yt_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 60;

function getConfig(req) {
  const origin = getOrigin(req);
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

  return {
    clientId,
    clientSecret,
    cookieSecret: process.env.AUTH_COOKIE_SECRET || clientSecret,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/auth/callback`,
    configured: Boolean(clientId && clientSecret),
  };
}

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function secureCookie(req) {
  return req.headers["x-forwarded-proto"] === "https" || /vercel\.app$/i.test(req.headers.host || "");
}

function serializeCookie(req, name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
  ];

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (secureCookie(req)) {
    parts.push("Secure");
  }
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

function encryptSession(config, session) {
  const key = crypto.createHash("sha256").update(config.cookieSecret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSession(config, value) {
  try {
    const [ivText, tagText, encryptedText] = String(value || "").split(".");
    if (!ivText || !tagText || !encryptedText) {
      return null;
    }

    const key = crypto.createHash("sha256").update(config.cookieSecret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

function getSession(req, config) {
  const cookies = parseCookies(req);
  return decryptSession(config, cookies[SESSION_COOKIE]);
}

function setSessionCookie(req, res, config, session) {
  appendSetCookie(res, serializeCookie(req, SESSION_COOKIE, encryptSession(config, session), {
    maxAge: SESSION_MAX_AGE,
  }));
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader?.("Set-Cookie");
  const values = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader("Set-Cookie", [...values, cookie]);
}

function clearAuthCookies(req, res) {
  res.setHeader("Set-Cookie", [
    serializeCookie(req, SESSION_COOKIE, "", { maxAge: 0 }),
    serializeCookie(req, STATE_COOKIE, "", { maxAge: 0 }),
  ]);
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

async function postToken(body) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google token request failed.");
  }

  return payload;
}

async function exchangeCode(req, config, code) {
  const payload = await postToken({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  return normalizeTokenPayload(payload);
}

async function refreshSession(config, session) {
  if (!session?.refresh_token) {
    throw new Error("Missing refresh token.");
  }

  if (session.access_token && session.expires_at && session.expires_at > Date.now() + 60_000) {
    return session;
  }

  const payload = await postToken({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: session.refresh_token,
    grant_type: "refresh_token",
  });

  return {
    ...session,
    ...normalizeTokenPayload(payload),
    refresh_token: payload.refresh_token || session.refresh_token,
  };
}

function normalizeTokenPayload(payload) {
  return {
    access_token: payload.access_token || "",
    refresh_token: payload.refresh_token || "",
    scope: payload.scope || READ_SCOPE,
    token_type: payload.token_type || "Bearer",
    expires_at: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
}

module.exports = {
  GOOGLE_AUTH_URL,
  READ_SCOPE,
  STATE_COOKIE,
  appendSetCookie,
  clearAuthCookies,
  exchangeCode,
  getConfig,
  getOrigin,
  getSession,
  parseCookies,
  redirect,
  refreshSession,
  sendJson,
  serializeCookie,
  setSessionCookie,
};
