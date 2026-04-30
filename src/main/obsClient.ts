import OBSWebSocket from "obs-websocket-js";
import {
  AgentConfig,
  LogEntry,
  ObsMediaAction,
  ObsRelayMediaShowPayload,
  ObsRelayGetStatusResult,
  ObsRelaySceneItem,
  ObsRelaySceneView,
  ObsTestResult,
} from "../shared/types.js";

const MEDIA_GROUP_NAME = "Balkon Media Group";
const MEDIA_IMAGE_SOURCE_NAME = "Balkon Media Image";
const MEDIA_GIF_SOURCE_NAME = "Balkon Media GIF";
const MEDIA_DEFAULT_URL = "about:blank";

interface ObsInputEntry {
  inputName?: string | null;
  inputKind?: string | null;
}

interface ObsInputListResponse {
  inputs?: ObsInputEntry[];
}

interface ObsCreateInputResponse {
  sceneItemId?: number;
}

interface ObsGetSceneItemIdResponse {
  sceneItemId?: number;
}

interface ObsVersionResponse {
  obsVersion?: string | null;
  obsWebSocketVersion?: string | null;
}

interface ObsCurrentProgramSceneResponse {
  currentProgramSceneName?: string | null;
}

interface ObsSceneListEntry {
  sceneName?: string | null;
}

interface ObsSceneListResponse {
  scenes?: ObsSceneListEntry[];
}

interface ObsSceneItemEntry {
  sceneItemId?: number | null;
  sourceName?: string | null;
  sceneItemEnabled?: boolean | null;
}

interface ObsSceneItemListResponse {
  sceneItems?: ObsSceneItemEntry[];
}

interface ObsConnectResponse {
  obsWebSocketVersion?: string | null;
}

export class ObsClient {
  private obs = new OBSWebSocket();
  private readonly logFn?: (level: LogEntry["level"], message: string) => void;
  private connected = false;
  private connectedUrl: string | null = null;
  private connectedPassword: string | null = null;
  private lastObsVersion: string | null = null;
  private lastWebsocketVersion: string | null = null;
  private mediaQueue: Promise<void> = Promise.resolve();

  constructor(logFn?: (level: LogEntry["level"], message: string) => void) {
    this.logFn = logFn;
  }

  async test(config: AgentConfig): Promise<ObsTestResult> {
    try {
      await this.ensureConnected(config);
      const version = await this.obs.call("GetVersion") as ObsVersionResponse;
      const currentScene = await this.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
      this.lastObsVersion = version.obsVersion ?? null;
      this.lastWebsocketVersion = version.obsWebSocketVersion ?? this.lastWebsocketVersion;

      return {
        ok: true,
        message: `Connected to OBS${currentScene.currentProgramSceneName ? `, current scene: ${currentScene.currentProgramSceneName}` : ""}.`,
        obsVersion: this.lastObsVersion,
        websocketVersion: this.lastWebsocketVersion,
        currentSceneName: currentScene.currentProgramSceneName ?? null,
      };
    } catch (error) {
      this.connected = false;
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to connect to OBS.",
      };
    }
  }

  async getStatus(config: AgentConfig): Promise<ObsRelayGetStatusResult> {
    try {
      await this.ensureConnected(config);
      const currentScene = await this.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
      const version = await this.obs.call("GetVersion") as ObsVersionResponse;
      this.lastObsVersion = version.obsVersion ?? null;
      this.lastWebsocketVersion = version.obsWebSocketVersion ?? this.lastWebsocketVersion;

      return {
        connected: true,
        currentSceneName: currentScene.currentProgramSceneName ?? null,
        endpoint: config.obsUrl,
        obsVersion: this.lastObsVersion,
        websocketVersion: this.lastWebsocketVersion,
      };
    } catch {
      this.connected = false;
      return {
        connected: false,
        currentSceneName: null,
        endpoint: config.obsUrl,
        obsVersion: this.lastObsVersion,
        websocketVersion: this.lastWebsocketVersion,
      };
    }
  }

  async listScenes(config: AgentConfig): Promise<ObsRelaySceneView[]> {
    await this.ensureConnected(config);
    const result = await this.obs.call("GetSceneList") as ObsSceneListResponse;
    return (result.scenes ?? [])
      .map(scene => ({ sceneName: String(scene.sceneName ?? "") }))
      .filter(scene => scene.sceneName.length > 0);
  }

  async listSceneItems(config: AgentConfig, sceneName: string): Promise<ObsRelaySceneItem[]> {
    await this.ensureConnected(config);
    const result = await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
    return (result.sceneItems ?? [])
      .map(item => ({
        sceneItemId: Number(item.sceneItemId ?? NaN),
        sourceName: String(item.sourceName ?? ""),
        enabled: Boolean(item.sceneItemEnabled),
      }))
      .filter(item => Number.isFinite(item.sceneItemId) && item.sourceName.length > 0);
  }

  async switchScene(config: AgentConfig, sceneName: string): Promise<void> {
    await this.ensureConnected(config);
    await this.obs.call("SetCurrentProgramScene", { sceneName });
  }

  async setSourceVisibility(config: AgentConfig, sceneName: string, sourceName: string, visible: boolean): Promise<void> {
    await this.ensureConnected(config);
    const items = await this.listSceneItems(config, sceneName);
    const targetItem = items.find(item => item.sourceName.toLowerCase() === sourceName.trim().toLowerCase());
    if (!targetItem) {
      throw new Error(`Source '${sourceName}' not found in scene '${sceneName}'.`);
    }

    await this.obs.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: targetItem.sceneItemId,
      sceneItemEnabled: visible,
    });
  }

  async setTextInputText(config: AgentConfig, inputName: string, text: string): Promise<void> {
    await this.ensureConnected(config);
    await this.obs.call("SetInputSettings", {
      inputName,
      inputSettings: { text },
      overlay: true,
    });
  }

  async triggerMediaInputAction(config: AgentConfig, inputName: string, mediaAction: ObsMediaAction): Promise<void> {
    await this.ensureConnected(config);
    await this.obs.call("TriggerMediaInputAction", { inputName, mediaAction });
  }

  async showMediaOverlay(config: AgentConfig, media: ObsRelayMediaShowPayload): Promise<{ ok: true }> {
    return this.enqueueMediaTask(async () => {
      this.validateMediaPayload(media);
      await this.ensureConnected(config);

      const currentScene = await this.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
      const sceneName = String(currentScene.currentProgramSceneName ?? "").trim();
      if (!sceneName) {
        throw new Error("OBS_MEDIA_SHOW_FAILED: Current program scene is not available.");
      }

      const setup = await this.ensureMediaOverlaySetup(sceneName);
      const sourceName = media.kind === "gif" ? MEDIA_GIF_SOURCE_NAME : MEDIA_IMAGE_SOURCE_NAME;
      const targetSceneItemId = media.kind === "gif" ? setup.gifSceneItemId : setup.imageSceneItemId;
      const otherSceneItemId = media.kind === "gif" ? setup.imageSceneItemId : setup.gifSceneItemId;

      await this.obs.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: this.getMediaOverlaySettings(media.url),
        overlay: true,
      });

      await this.obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: otherSceneItemId,
        sceneItemEnabled: false,
      });

      this.log("info", `Showing media source '${sourceName}' in scene '${sceneName}'.`);

      await this.obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: targetSceneItemId,
        sceneItemEnabled: true,
      });

      try {
        await this.sleep(media.durationMs);
      } finally {
        this.log("info", `Hiding media source '${sourceName}' in scene '${sceneName}'.`);
        await this.obs.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: targetSceneItemId,
          sceneItemEnabled: false,
        });
      }

      return { ok: true };
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.obs.disconnect();
    } finally {
      this.connected = false;
      this.connectedUrl = null;
      this.connectedPassword = null;
    }
  }

  private async ensureConnected(config: AgentConfig): Promise<void> {
    const password = config.obsPassword.length ? config.obsPassword : undefined;
    const passwordKey = password ?? null;
    const configChanged = this.connectedUrl !== config.obsUrl || this.connectedPassword !== passwordKey;

    if (this.connected && !configChanged) {
      return;
    }

    if (this.connected && configChanged) {
      await this.disconnect();
    }

    this.obs = new OBSWebSocket();
    this.obs.on("ConnectionClosed", () => {
      this.connected = false;
    });

    const result = await this.obs.connect(config.obsUrl, password) as ObsConnectResponse;
    this.connected = true;
    this.connectedUrl = config.obsUrl;
    this.connectedPassword = passwordKey;
    this.lastWebsocketVersion = result.obsWebSocketVersion ?? null;

    await this.ensureMediaOverlaySetupForCurrentScene();
  }

  private async enqueueMediaTask(task: () => Promise<{ ok: true }>): Promise<{ ok: true }> {
    const runTask = async () => task();
    const queuedTask = this.mediaQueue.then(runTask, runTask);
    this.mediaQueue = queuedTask.then(() => undefined, () => undefined);
    return queuedTask;
  }

  private validateMediaPayload(media: ObsRelayMediaShowPayload): void {
    if (media.kind !== "image" && media.kind !== "gif") {
      throw new Error("OBS_MEDIA_SHOW_FAILED: Unsupported media kind.");
    }

    if (!/^https?:\/\//i.test(media.url.trim())) {
      throw new Error("OBS_MEDIA_SHOW_FAILED: Media URL must start with http:// or https://.");
    }

    if (!Number.isFinite(media.durationMs) || media.durationMs < 1000 || media.durationMs > 15000) {
      throw new Error("OBS_MEDIA_SHOW_FAILED: durationMs must be between 1000 and 15000.");
    }
  }

  private async ensureMediaOverlaySetupForCurrentScene(): Promise<void> {
    const currentScene = await this.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
    const sceneName = String(currentScene.currentProgramSceneName ?? "").trim();
    if (!sceneName) {
      return;
    }

    await this.ensureMediaOverlaySetup(sceneName);
  }

  private async ensureMediaOverlaySetup(sceneName: string): Promise<{ imageSceneItemId: number; gifSceneItemId: number }> {
    const image = await this.ensureMediaBrowserSource(sceneName, MEDIA_IMAGE_SOURCE_NAME);
    const gif = await this.ensureMediaBrowserSource(sceneName, MEDIA_GIF_SOURCE_NAME);
    this.log("info", `Media overlay setup ensured in scene '${sceneName}' (group '${MEDIA_GROUP_NAME}' is TODO).`);
    return {
      imageSceneItemId: image.sceneItemId,
      gifSceneItemId: gif.sceneItemId,
    };
  }

  private async ensureMediaBrowserSource(sceneName: string, sourceName: string): Promise<{ sceneItemId: number }> {
    const [inputList, existingSceneItemId] = await Promise.all([
      this.obs.call("GetInputList") as Promise<ObsInputListResponse>,
      this.findSceneItemId(sceneName, sourceName),
    ]);

    const inputExists = (inputList.inputs ?? []).some(input => String(input.inputName ?? "") === sourceName);

    if (!inputExists) {
      const created = await this.obs.call("CreateInput", {
        sceneName,
        inputName: sourceName,
        inputKind: "browser_source",
        inputSettings: this.getMediaOverlaySettings(MEDIA_DEFAULT_URL),
        sceneItemEnabled: false,
      }) as ObsCreateInputResponse;

      const createdSceneItemId = Number(created.sceneItemId ?? NaN);
      if (!Number.isFinite(createdSceneItemId)) {
        throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to create source '${sourceName}'.`);
      }

      this.log("info", `${sourceName} created.`);
      return { sceneItemId: createdSceneItemId };
    }

    this.log("info", `${sourceName} already exists.`);

    if (existingSceneItemId !== null) {
      await this.obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: existingSceneItemId,
        sceneItemEnabled: false,
      });
      return { sceneItemId: existingSceneItemId };
    }

    const createdSceneItem = await this.obs.call("CreateSceneItem", {
      sceneName,
      sourceName,
      sceneItemEnabled: false,
    }) as ObsCreateInputResponse;

    const createdSceneItemId = Number(createdSceneItem.sceneItemId ?? NaN);
    if (!Number.isFinite(createdSceneItemId)) {
      throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to place source '${sourceName}' in scene '${sceneName}'.`);
    }

    return { sceneItemId: createdSceneItemId };
  }

  private async findSceneItemId(sceneName: string, sourceName: string): Promise<number | null> {
    try {
      const result = await this.obs.call("GetSceneItemId", {
        sceneName,
        sourceName,
      }) as ObsGetSceneItemIdResponse;

      const sceneItemId = Number(result.sceneItemId ?? NaN);
      return Number.isFinite(sceneItemId) ? sceneItemId : null;
    } catch {
      return null;
    }
  }

  private getMediaOverlaySettings(url: string): {
    url: string;
    width: number;
    height: number;
    shutdown: boolean;
    restart_when_active: boolean;
  } {
    return {
      url,
      width: 800,
      height: 450,
      shutdown: true,
      restart_when_active: true,
    };
  }

  private async sleep(durationMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, durationMs));
  }

  private log(level: LogEntry["level"], message: string): void {
    this.logFn?.(level, message);
  }
}
