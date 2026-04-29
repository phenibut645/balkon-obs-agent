import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { UpdateState } from "../shared/types.js";

type UpdateListener = (state: UpdateState) => void;

export class UpdateManager {
  private readonly listeners = new Set<UpdateListener>();
  private state: UpdateState = {
    status: app.isPackaged ? "idle" : "disabled",
    currentVersion: app.getVersion(),
    availableVersion: null,
    percent: null,
    message: app.isPackaged ? "Ready to check for updates." : "Updates are available only in the packaged app.",
  };

  constructor() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    this.registerEvents();
  }

  onState(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): UpdateState {
    return this.state;
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!app.isPackaged) {
      this.setState({
        status: "disabled",
        percent: null,
        message: "Updates are available only in the packaged app.",
      });
      return this.state;
    }

    if (this.state.status === "checking" || this.state.status === "downloading") {
      return this.state;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.setState({
        status: "error",
        percent: null,
        message: error instanceof Error ? error.message : "Failed to check for updates.",
      });
    }

    return this.state;
  }

  async installDownloadedUpdate(): Promise<UpdateState> {
    if (this.state.status !== "downloaded") {
      this.setState({
        message: "No downloaded update is ready to install.",
      });
      return this.state;
    }

    autoUpdater.quitAndInstall(false, true);
    return this.state;
  }

  private registerEvents(): void {
    autoUpdater.on("checking-for-update", () => {
      this.setState({
        status: "checking",
        availableVersion: null,
        percent: null,
        message: "Checking for updates...",
      });
    });

    autoUpdater.on("update-available", info => {
      this.setState({
        status: "available",
        availableVersion: info.version,
        percent: null,
        message: `Update ${info.version} is available. Downloading...`,
      });
    });

    autoUpdater.on("update-not-available", () => {
      this.setState({
        status: "not-available",
        availableVersion: null,
        percent: null,
        message: `You are on the latest version (${app.getVersion()}).`,
      });
    });

    autoUpdater.on("download-progress", progress => {
      const percent = Math.round(progress.percent);
      this.setState({
        status: "downloading",
        percent,
        message: `Downloading update... ${percent}%`,
      });
    });

    autoUpdater.on("update-downloaded", info => {
      this.setState({
        status: "downloaded",
        availableVersion: info.version,
        percent: 100,
        message: `Update ${info.version} downloaded. Restart to install.`,
      });
    });

    autoUpdater.on("error", error => {
      this.setState({
        status: "error",
        percent: null,
        message: error instanceof Error ? error.message : "Updater error.",
      });
    });
  }

  private setState(partial: Partial<UpdateState>): void {
    this.state = {
      ...this.state,
      ...partial,
      currentVersion: app.getVersion(),
    };

    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
