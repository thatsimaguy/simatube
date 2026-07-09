import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";
process.env.AUTH_COOKIE_SECRET = "test-cookie-secret";

const shared = require("../api/auth/_shared.js");
const start = require("../api/auth/start.js");
const callback = require("../api/auth/callback.js");
const session = require("../api/auth/session.js");
const logout = require("../api/auth/logout.js");

const baseRequest = {
  method: "GET",
  url: "/",
  headers: {
    host: "app.example.com",
    "x-forwarded-host": "app.example.com",
    "x-forwarded-proto": "https",
  },
};

function request(overrides = {}) {
  return {
    ...baseRequest,
    ...overrides,
    headers: {
      ...baseRequest.headers,
      ...(overrides.headers || {}),
    },
  };
}

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(body = "") {
      this.body = body;
    },
  };
}

async function invoke(handler, req) {
  const res = response();
  await Promise.resolve(handler(req, res));
  return res;
}

const malformedCookies = shared.parseCookies(request({
  headers: { cookie: "broken=%E0%A4%A; normal=value" },
}));
assert.equal(malformedCookies.broken, "%E0%A4%A");
assert.equal(malformedCookies.normal, "value");

const config = shared.getConfig(baseRequest);
const cookieResponse = response();
const originalSession = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  scope: "scope.read scope.write",
  expires_at: Date.now() + 60_000,
};
shared.setSessionCookie(baseRequest, cookieResponse, config, originalSession);
const setCookie = cookieResponse.getHeader("Set-Cookie");
assert.ok(Array.isArray(setCookie));
assert.match(setCookie[0], /HttpOnly/);
assert.match(setCookie[0], /Secure/);
assert.match(setCookie[0], /SameSite=Lax/);
const sessionCookie = setCookie[0].split(";", 1)[0];
assert.deepEqual(
  shared.getSession(request({ headers: { cookie: sessionCookie } }), config),
  originalSession,
);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  assert.equal(options.method, "POST");
  assert.ok(options.signal instanceof AbortSignal);
  return {
    ok: true,
    status: 200,
    async json() {
      return { access_token: "refreshed-token", expires_in: 3600 };
    },
  };
};
try {
  const refreshed = await shared.refreshSession(config, {
    ...originalSession,
    expires_at: 0,
  });
  assert.equal(refreshed.access_token, "refreshed-token");
  assert.equal(refreshed.refresh_token, originalSession.refresh_token);
  assert.equal(refreshed.scope, originalSession.scope);
} finally {
  globalThis.fetch = originalFetch;
}

for (const [handler, allowed, method] of [
  [start, "GET", "POST"],
  [callback, "GET", "POST"],
  [session, "GET", "POST"],
  [logout, "POST", "GET"],
]) {
  const res = await invoke(handler, request({ method }));
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader("Allow"), allowed);
  assert.match(res.body, /Method not allowed/);
}

const startResponse = await invoke(start, request({
  method: "GET",
  url: "/api/auth/start",
}));
assert.equal(startResponse.statusCode, 302);
assert.match(startResponse.getHeader("Location"), /^https:\/\/accounts\.google\.com\//);
assert.equal(startResponse.getHeader("Cache-Control"), "no-store, max-age=0");
assert.equal(startResponse.getHeader("Referrer-Policy"), "no-referrer");
assert.match(startResponse.getHeader("Set-Cookie"), /yt_oauth_state=/);

const invalidSessionResponse = await invoke(session, request({
  method: "GET",
  url: "/api/auth/session",
  headers: { cookie: "yt_server_session=not-a-valid-session" },
}));
assert.equal(invalidSessionResponse.statusCode, 200);
assert.equal(JSON.parse(invalidSessionResponse.body).authenticated, false);

const logoutResponse = await invoke(logout, request({ method: "POST" }));
assert.equal(logoutResponse.statusCode, 200);
assert.equal(JSON.parse(logoutResponse.body).ok, true);
assert.equal(logoutResponse.getHeader("Set-Cookie").length, 2);

console.log("Auth checks passed.");
