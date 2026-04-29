import { contextBridge, ipcRenderer } from "electron";
import type { AgentConfig, AgentState, LogEntry, ObsTestResult, RendererApi } from "./shared/types.js";

const api: RendererApi = {
  loadConfig: () => ipcRenderer.invoke("config:load") as Promise<AgentConfig>,
  saveConfig: (config: AgentConfig) => ipcRenderer.invoke("config:save", config) as Promise<AgentConfig>,
  connect: (config: AgentConfig) => ipcRenderer.invoke("agent:connect", config) as Promise<AgentState>,
  disconnect: () => ipcRenderer.invoke("agent:disconnect") as Promise<AgentState>,
  testObs: (config: AgentConfig) => ipcRenderer.invoke("obs:test", config) as Promise<ObsTestResult>,
  onStateChange: (callback: (state: AgentState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AgentState) => callback(state);
    ipcRenderer.on("agent:state", listener);
    return () => ipcRenderer.removeListener("agent:state", listener);
  },
  onLog: (callback: (entry: LogEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry);
    ipcRenderer.on("agent:log", listener);
    return () => ipcRenderer.removeListener("agent:log", listener);
  },
};

contextBridge.exposeInMainWorld("balkonAgent", api);
