const { contextBridge, ipcRenderer } = require("electron");

const api = {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: config => ipcRenderer.invoke("config:save", config),
  connect: config => ipcRenderer.invoke("agent:connect", config),
  disconnect: () => ipcRenderer.invoke("agent:disconnect"),
  testObs: config => ipcRenderer.invoke("obs:test", config),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: settings => ipcRenderer.invoke("settings:save", settings),
  onStateChange: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("agent:state", listener);
    return () => ipcRenderer.removeListener("agent:state", listener);
  },
  onLog: callback => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("agent:log", listener);
    return () => ipcRenderer.removeListener("agent:log", listener);
  },
  onUpdateState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
  onTrayAction: callback => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("tray:action", listener);
    return () => ipcRenderer.removeListener("tray:action", listener);
  },
};

contextBridge.exposeInMainWorld("balkonAgent", api);
