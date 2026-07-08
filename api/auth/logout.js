const {
  clearAuthCookies,
  sendJson,
} = require("./_shared");

module.exports = function handler(req, res) {
  clearAuthCookies(req, res);
  sendJson(res, 200, {
    ok: true,
  });
};
