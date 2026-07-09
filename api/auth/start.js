const crypto = require("node:crypto");
const {
  GOOGLE_AUTH_URL,
  READ_SCOPE,
  STATE_COOKIE,
  getConfig,
  methodNotAllowed,
  redirect,
  sendJson,
  serializeCookie,
} = require("./_shared");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const config = getConfig(req);

  if (!config.configured) {
    sendJson(res, 501, {
      configured: false,
      error: "Server OAuth is not configured yet.",
    });
    return;
  }

  const state = crypto.randomUUID();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", READ_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  res.setHeader("Set-Cookie", serializeCookie(req, STATE_COOKIE, state, {
    maxAge: 10 * 60,
  }));
  redirect(res, url.toString());
};
