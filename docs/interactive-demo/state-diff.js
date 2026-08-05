(() => {
  "use strict";

  const STATE_DIFF_VERSION = 1;

  function modelApi() {
    if (typeof module !== "undefined" && module.exports) return require("./state-model");
    return typeof window !== "undefined" ? window.OsStateModel : null;
  }

  function usable(field) {
    return Boolean(field && field.status !== "insufficient");
  }

  function fieldIdentity(field) {
    if (!field) return "missing";
    if (!usable(field)) return "insufficient";
    return `${field.status}:${field.value}`;
  }

  function diffStates(starterState, solutionState) {
    if (!starterState || !solutionState || starterState.lab !== solutionState.lab) return null;
    const keys = [
      ...Object.keys(starterState.fields || {}),
      ...Object.keys(solutionState.fields || {}).filter((key) => !Object.hasOwn(starterState.fields || {}, key))
    ];
    const rows = keys.map((key) => {
      const starter = starterState.fields?.[key] || null;
      const solution = solutionState.fields?.[key] || null;
      let scope = "changed";
      if (fieldIdentity(starter) === fieldIdentity(solution)) scope = "same";
      else if (usable(starter) && !usable(solution)) scope = "starter-only";
      else if (!usable(starter) && usable(solution)) scope = "solution-only";
      return {
        key,
        label: starter?.label || solution?.label || key,
        scope,
        starter,
        solution
      };
    });
    return {
      version: STATE_DIFF_VERSION,
      lab: starterState.lab,
      starterState,
      solutionState,
      rows,
      same: rows.filter((row) => row.scope === "same"),
      changed: rows.filter((row) => row.scope === "changed"),
      starterOnly: rows.filter((row) => row.scope === "starter-only"),
      solutionOnly: rows.filter((row) => row.scope === "solution-only")
    };
  }

  function compareRuns(first, second) {
    if (!first || !second || !Array.isArray(first.events) || !Array.isArray(second.events)) return null;
    const runs = [first, second];
    const starter = runs.find((run) => run.context?.variant === "starter");
    const solution = runs.find((run) => run.context?.variant === "solution");
    const lab = starter?.context?.lab;
    if (!starter || !solution || !lab || lab !== solution.context?.lab) return null;
    const model = modelApi();
    if (!model?.computeState) return null;
    return diffStates(
      model.computeState(starter.events, { lab, variant: "starter" }),
      model.computeState(solution.events, { lab, variant: "solution" })
    );
  }

  const api = {
    STATE_DIFF_VERSION,
    compareRuns,
    diffStates,
    fieldIdentity,
    usable
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsStateDiff = api;
})();
