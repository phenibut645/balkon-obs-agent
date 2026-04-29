import { createRequire } from "node:module";
import { app } from "electron";
import { UpdateState } from "../shared/types.js";

type UpdateListener = (state: UpdateState) => void;
const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");

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
    autoUpdater.autoInstallOnAppQuit = true;
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
        message: this.formatUpdateError(error),
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
        message: this.formatUpdateError(error),
      });
    });
  }

  private formatUpdateError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || "");

    if (message.includes("latest.yml") && message.includes("404")) {
      return "Update metadata is missing from the latest GitHub Release. Upload latest.yml together with the installer and blockmap.";
    }

    if (message.includes("net::ERR_INTERNET_DISCONNECTED") || message.includes("ENOTFOUND")) {
      return "Cannot check for updates. Check your internet connection.";
    }

    if (message.includes("401") || message.includes("403")) {
      return "Cannot check for updates. GitHub denied access to the release.";
    }

    return message || "Failed to check for updates.";
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
