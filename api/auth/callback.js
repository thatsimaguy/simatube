const {
  STATE_COOKIE,
  clearAuthCookies,
  exchangeCode,
  getConfig,
  getOrigin,
  parseCookies,
  redirect,
  serializeCookie,
  setSessionCookie,
} = require("./_shared");

module.exports = async function handler(req, res) {
  const config = getConfig(req);
  const origin = getOrigin(req);
  const requestUrl = new URL(req.url || "/api/auth/callback", origin);
  const error = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookies = parseCookies(req);

  if (error) {
    clearAuthCookies(req, res);
    redirect(res, `/?auth=error#signin`);
    return;
  }

  if (!config.configured || !code || !state || state !== cookies[STATE_COOKIE]) {
    clearAuthCookies(req, res);
    redirect(res, `/?auth=invalid#signin`);
    return;
  }

  try {
    const session = await exchangeCode(req, config, code);
    if (!session.refresh_token) {
      throw new Error("Google did not return a refresh token.");
    }

    setSessionCookie(req, res, config, session);
    res.appendHeader?.("Set-Cookie", serializeCookie(req, STATE_COOKIE, "", { maxAge: 0 }));
    redirect(res, "/?auth=server#home");
  } catch {
    clearAuthCookies(req, res);
    redirect(res, `/?auth=failed#signin`);
  }
};
