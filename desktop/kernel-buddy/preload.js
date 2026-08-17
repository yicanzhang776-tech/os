"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("kernelBuddy", Object.freeze({
  closePrompt: () => ipcRenderer.invoke("prompt:close"),
  hidePet: () => ipcRenderer.invoke("pet:hide"),
  onContext: (callback) => subscribe("pet:context", callback),
  onSettings: (callback) => subscribe("pet:settings", callback),
  openPrompt: () => ipcRenderer.invoke("pet:open-prompt"),
  openTutor: () => ipcRenderer.invoke("prompt:open-tutor"),
  quit: () => ipcRenderer.invoke("app:quit"),
  resetPosition: () => ipcRenderer.invoke("pet:reset"),
  setAlwaysOnTop: (value) => ipcRenderer.invoke("pet:set-always-on-top", value === true),
  setMotionPaused: (value) => ipcRenderer.invoke("pet:set-motion-paused", value === true),
  submitPrompt: (message) => ipcRenderer.invoke("prompt:submit", message)
}));
