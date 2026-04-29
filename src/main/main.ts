import { BrowserWindow, Menu, app, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentConfig, LogEntry } from "../shared/types.js";
import { ConfigStore } from "./configStore.js";
import { RelayClient } from "./relayClient.js";
import { UpdateManager } from "./updateManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let configStore: ConfigStore | null = null;
const relayClient = new RelayClient();
const updateManager = new UpdateManager();

function getConfigStore(): ConfigStore {
  if (!configStore) {
    configStore = new ConfigStore();
  }

  return configStore;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    title: "Balkon OBS Agent",
    backgroundColor: "#eef2f5",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendState(): void {
  mainWindow?.webContents.send("agent:state", relayClient.getState());
}

function sendLog(entry: LogEntry): void {
  mainWindow?.webContents.send("agent:log", entry);
}

function sendUpdateState(): void {
  mainWindow?.webContents.send("updates:state", updateManager.getState());
}

app.whenReady().then(() => {
  getConfigStore();
  relayClient.onState(sendState);
  relayClient.onLog(sendLog);
  updateManager.onState(sendUpdateState);
  createWindow();

  mainWindow?.webContents.once("did-finish-load", () => {
    sendUpdateState();
    setTimeout(() => {
      void updateManager.checkForUpdates();
    }, 1_500);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void relayClient.disconnect();
});

ipcMain.handle("config:load", async () => getConfigStore().load());

ipcMain.handle("config:save", async (_event, config: AgentConfig) => getConfigStore().save(config));

ipcMain.handle("agent:connect", async (_event, config: AgentConfig) => {
  const normalizedConfig = await getConfigStore().save(config);
  return relayClient.connect(normalizedConfig);
});

ipcMain.handle("agent:disconnect", async () => relayClient.disconnect());

ipcMain.handle("obs:test", async (_event, config: AgentConfig) => {
  const normalizedConfig = await getConfigStore().save(config);
  return relayClient.testObs(normalizedConfig);
});

ipcMain.handle("updates:check", async () => updateManager.checkForUpdates());

ipcMain.handle("updates:install", async () => updateManager.installDownloadedUpdate());
