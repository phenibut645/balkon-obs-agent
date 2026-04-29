import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentConfig, AgentSettings, LogEntry } from "../shared/types.js";
import { ConfigStore } from "./configStore.js";
import { RelayClient } from "./relayClient.js";
import { UpdateManager } from "./updateManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single instance lock — if another instance tries to launch, focus this one instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let configStore: ConfigStore | null = null;
const relayClient = new RelayClient();
const updateManager = new UpdateManager();

function getConfigStore(): ConfigStore {
  if (!configStore) {
    configStore = new ConfigStore();
  }

  return configStore;
}

// Minimal 16x16 tray icon as inline base64 PNG (dark gray Balkon square).
const TRAY_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAHUlEQVQ4y2NgGAWjgBiA" +
  "gYGBgYmBgYGJgYGBiQEABhAAAWQAbVoAAAAASUVORK5CYII=";

function createTrayIcon(): Tray {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`);
  const t = new Tray(icon);
  t.setToolTip("Balkon OBS Agent");
  t.setContextMenu(buildTrayMenu());
  t.on("click", () => showWindow());
  return t;
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: "Open", click: () => showWindow() },
    { type: "separator" },
    {
      label: "Connect",
      click: () => {
        void (async () => {
          const config = await getConfigStore().load();
          await relayClient.connect(config);
        })();
      },
    },
    {
      label: "Disconnect",
      click: () => { void relayClient.disconnect(); },
    },
    { type: "separator" },
    {
      label: "Check Updates",
      click: () => { void updateManager.checkForUpdates(); },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }

  mainWindow.show();
  mainWindow.focus();
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
      preload: path.join(__dirname, "../preload.cjs"),
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

  mainWindow.on("close", event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

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

function applyStartWithWindows(enabled: boolean): void {
  if (!app.isPackaged) {
    console.log(
      enabled
        ? "[startup] Start with Windows not registered in dev mode."
        : "[startup] Start with Windows not changed in dev mode.",
    );
    return;
  }

  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
}

app.whenReady().then(() => {
  const store = getConfigStore();

  // When a second instance is launched, focus the existing window instead.
  app.on("second-instance", () => {
    showWindow();
  });

  relayClient.onState(sendState);
  relayClient.onLog(sendLog);
  updateManager.onState(sendUpdateState);

  tray = createTrayIcon();

  void (async () => {
    const settings = await store.loadSettings();
    relayClient.setAutoRetryObs(settings.autoRetryObs);

    if (settings.startMinimizedToTray) {
      createWindow();
      mainWindow?.hide();
    } else {
      createWindow();
    }

    mainWindow?.webContents.once("did-finish-load", () => {
      sendUpdateState();
      setTimeout(() => {
        void updateManager.checkForUpdates();
      }, 1_500);
    });

    if (settings.autoConnectOnLaunch) {
      const config = await store.load();
      if (config.agentId.trim() && config.agentToken.trim()) {
        await relayClient.connect(config);
      } else {
        console.log("[auto-connect] Skipped: Agent ID or Token is missing.");
      }
    }
  })();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  void relayClient.disconnect();
});

app.on("window-all-closed", () => {
  // Do not quit when windows close — stay in tray.
  // Quit only happens via tray Quit or before-quit.
});

// App
ipcMain.handle("app:getVersion", () => app.getVersion());

// Config
ipcMain.handle("config:load", async () => getConfigStore().load());
ipcMain.handle("config:save", async (_event, config: AgentConfig) => getConfigStore().save(config));

// Settings
ipcMain.handle("settings:load", async () => getConfigStore().loadSettings());

ipcMain.handle("settings:save", async (_event, settings: AgentSettings) => {
  const saved = await getConfigStore().saveSettings(settings);
  relayClient.setAutoRetryObs(saved.autoRetryObs);
  applyStartWithWindows(saved.startWithWindows);
  return saved;
});

// Agent
ipcMain.handle("agent:connect", async (_event, config: AgentConfig) => {
  const normalizedConfig = await getConfigStore().save(config);
  return relayClient.connect(normalizedConfig);
});

ipcMain.handle("agent:disconnect", async () => relayClient.disconnect());

ipcMain.handle("obs:test", async (_event, config: AgentConfig) => {
  const normalizedConfig = await getConfigStore().save(config);
  return relayClient.testObs(normalizedConfig);
});

// Updates
ipcMain.handle("updates:check", async () => updateManager.checkForUpdates());
ipcMain.handle("updates:install", async () => updateManager.installDownloadedUpdate());
