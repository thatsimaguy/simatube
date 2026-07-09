const {
  clearAuthCookies,
  getConfig,
  getSession,
  methodNotAllowed,
  refreshSession,
  sendJson,
  setSessionCookie,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const config = getConfig(req);

  if (!config.configured) {
    sendJson(res, 200, {
      configured: false,
      authenticated: false,
    });
    return;
  }

  const session = getSession(req, config);
  if (!session) {
    sendJson(res, 200, {
      configured: true,
      authenticated: false,
    });
    return;
  }

  try {
    const refreshed = await refreshSession(config, session);
    setSessionCookie(req, res, config, refreshed);
    sendJson(res, 200, {
      configured: true,
      authenticated: true,
      accessToken: refreshed.access_token,
      expiresAt: refreshed.expires_at,
      scopes: String(refreshed.scope || "").split(" ").filter(Boolean),
    });
  } catch {
    clearAuthCookies(req, res);
    sendJson(res, 401, {
      configured: true,
      authenticated: false,
    });
  }
};
