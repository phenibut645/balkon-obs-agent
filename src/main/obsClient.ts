import OBSWebSocket from "obs-websocket-js";
import {
  AgentConfig,
  ObsMediaAction,
  ObsRelayMediaShowPayload,
  ObsRelayGetStatusResult,
  ObsRelaySceneItem,
  ObsRelaySceneView,
  ObsTestResult,
} from "../shared/types.js";

const MEDIA_OVERLAY_SOURCE_NAME = "Balkon Media Overlay";

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
  private connected = false;
  private connectedUrl: string | null = null;
  private connectedPassword: string | null = null;
  private lastObsVersion: string | null = null;
  private lastWebsocketVersion: string | null = null;
  private mediaQueue: Promise<void> = Promise.resolve();

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

      const sceneItemId = await this.ensureMediaOverlaySceneItem(sceneName, media.url);

      await this.obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId,
        sceneItemEnabled: true,
      });

      try {
        await this.sleep(media.durationMs);
      } finally {
        await this.obs.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId,
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

  private async ensureMediaOverlaySceneItem(sceneName: string, mediaUrl: string): Promise<number> {
    const [inputList, existingSceneItemId] = await Promise.all([
      this.obs.call("GetInputList") as Promise<ObsInputListResponse>,
      this.findSceneItemId(sceneName, MEDIA_OVERLAY_SOURCE_NAME),
    ]);

    const inputExists = (inputList.inputs ?? []).some(input => String(input.inputName ?? "") === MEDIA_OVERLAY_SOURCE_NAME);

    if (!inputExists) {
      const created = await this.obs.call("CreateInput", {
        sceneName,
        inputName: MEDIA_OVERLAY_SOURCE_NAME,
        inputKind: "browser_source",
        inputSettings: this.getMediaOverlaySettings(mediaUrl),
        sceneItemEnabled: false,
      }) as ObsCreateInputResponse;

      return Number(created.sceneItemId ?? NaN);
    }

    await this.obs.call("SetInputSettings", {
      inputName: MEDIA_OVERLAY_SOURCE_NAME,
      inputSettings: this.getMediaOverlaySettings(mediaUrl),
      overlay: true,
    });

    if (existingSceneItemId !== null) {
      return existingSceneItemId;
    }

    const createdSceneItem = await this.obs.call("CreateSceneItem", {
      sceneName,
      sourceName: MEDIA_OVERLAY_SOURCE_NAME,
      sceneItemEnabled: false,
    }) as ObsCreateInputResponse;

    return Number(createdSceneItem.sceneItemId ?? NaN);
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
}
