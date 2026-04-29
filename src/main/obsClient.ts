import OBSWebSocket from "obs-websocket-js";
import {
  AgentConfig,
  ObsMediaAction,
  ObsRelayGetStatusResult,
  ObsRelaySceneItem,
  ObsRelaySceneView,
  ObsTestResult,
} from "../shared/types.js";

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
}
