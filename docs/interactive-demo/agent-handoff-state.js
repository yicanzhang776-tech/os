(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentHandoffState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

  function readAndClearHandoffToken(location, history) {
    const hash = typeof location?.hash === "string" ? location.hash : "";
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const token = params.get("handoff");
    if (token !== null && typeof history?.replaceState === "function") {
      history.replaceState(null, "", `${location.pathname || ""}${location.search || ""}`);
    }
    return TOKEN_PATTERN.test(token || "") ? token : null;
  }

  async function consumeLocationHandoff(options = {}) {
    const token = readAndClearHandoffToken(options.location, options.history);
    if (!token) return null;
    return options.client.consumeAgentHandoff(token, { fetchImpl: options.fetchImpl });
  }

  return Object.freeze({ TOKEN_PATTERN, consumeLocationHandoff, readAndClearHandoffToken });
});
