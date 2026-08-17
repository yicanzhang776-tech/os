(function () {
  "use strict";
  const bridge = window.kernelBuddy;
  const form = document.getElementById("prompt-form");
  const message = document.getElementById("prompt-message");
  const submit = document.getElementById("prompt-submit");
  const close = document.getElementById("prompt-close");
  const full = document.getElementById("prompt-full");
  const status = document.getElementById("prompt-status");
  const count = document.getElementById("prompt-count");
  const context = document.getElementById("prompt-context");
  if (!bridge || !form || !message || !submit || !close || !full || !status || !count || !context) return;

  let busy = false;
  function setBusy(value) { busy = value; submit.disabled = value; message.disabled = value; }
  function updateCount() { count.textContent = `${message.value.length} / 4000`; status.textContent = ""; }

  message.addEventListener("input", updateCount);
  message.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    status.textContent = "正在转交…";
    try {
      await bridge.submitPrompt(message.value);
      status.textContent = "已在浏览器打开助教";
      message.value = "";
      updateCount();
    } catch (error) {
      status.textContent = /4000/u.test(error?.message || "") ? "问题最多 4000 个字符" : "转交失败，请确认实验服务仍在运行";
      message.focus();
    } finally { setBusy(false); }
  });
  close.addEventListener("click", () => bridge.closePrompt());
  full.addEventListener("click", () => bridge.openTutor());
  bridge.onContext((value) => {
    context.textContent = `${value?.branch || "未知分支"} · ${value?.label || "等待实验状态"}`;
  });
  window.addEventListener("focus", () => message.focus());
  updateCount();
})();
