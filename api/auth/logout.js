const {
  clearAuthCookies,
  methodNotAllowed,
  sendJson,
} = require("./_shared");

module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  clearAuthCookies(req, res);
  sendJson(res, 200, {
    ok: true,
  });
};
