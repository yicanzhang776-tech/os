(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsDemoUiShellState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LEGACY_UI_STORAGE_KEY = "os-demo.ui-variant.v1";
  const WORKSPACE_VIEW_KEY = "os-demo.workspace-view.v1";
  const WORKSPACE_VIEWS = Object.freeze(["experiment", "evidence", "reflect"]);

  function validWorkspaceView(value) {
    return typeof value === "string" && WORKSPACE_VIEWS.includes(value) ? value : null;
  }

  function removeLegacyUiParameter(url) {
    try {
      const next = new URL(String(url));
      if (!next.searchParams.has("ui")) return null;
      next.searchParams.delete("ui");
      return next.toString();
    } catch (_) {
      return null;
    }
  }

  function clearLegacyUiPreference(storage) {
    try {
      storage?.removeItem(LEGACY_UI_STORAGE_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadWorkspaceView(storage) {
    try {
      return validWorkspaceView(storage?.getItem(WORKSPACE_VIEW_KEY)) || "experiment";
    } catch (_) {
      return "experiment";
    }
  }

  function saveWorkspaceView(storage, view) {
    const normalized = validWorkspaceView(view);
    if (!normalized) return false;
    try {
      storage?.setItem(WORKSPACE_VIEW_KEY, normalized);
      return storage?.getItem(WORKSPACE_VIEW_KEY) === normalized;
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({
    LEGACY_UI_STORAGE_KEY,
    WORKSPACE_VIEW_KEY,
    WORKSPACE_VIEWS,
    clearLegacyUiPreference,
    loadWorkspaceView,
    removeLegacyUiParameter,
    saveWorkspaceView
  });
});
