import OBSWebSocket from "obs-websocket-js";
import {
  AgentConfig,
  LogEntry,
  ObsMediaAction,
  ObsRelayBrowserSourceCreatePayload,
  ObsRelayBrowserSourceCreateResult,
  ObsRelayBrowserSourceUpdatePayload,
  ObsRelayBrowserSourceUpdateResult,
  ObsRelayGetStatusResult,
  ObsRelayMediaShowPayload,
  ObsRelaySceneItem,
  ObsRelaySceneItemIndexSetPayload,
  ObsRelaySceneItemIndexSetResult,
  ObsRelaySceneItemRemovePayload,
  ObsRelaySceneItemRemoveResult,
  ObsRelaySceneItemsListResult,
  ObsRelaySceneItemTransformSetPayload,
  ObsRelaySceneItemTransformSetResult,
  ObsRelaySceneItemVisibilitySetPayload,
  ObsRelaySceneItemVisibilitySetResult,
  ObsRelayScenesListResult,
  ObsRelaySceneView,
  ObsRelaySourceSettingsGetPayload,
  ObsRelaySourceSettingsGetResult,
  ObsRelayTextSourceCreatePayload,
  ObsRelayTextSourceCreateResult,
  ObsRelayTextSourceUpdatePayload,
  ObsRelayTextSourceUpdateResult,
  ObsTestResult,
} from "../shared/types.js";
import { disconnectClient, ensureConnected, getConnectionMetadata, getStatus, ObsConnectionState, testConnection } from "./obs/connection.js";
import { ensureMediaOverlaySetupForCurrentScene, showMediaOverlay } from "./obs/mediaOverlay.js";
import { getSourceSettingsForStudio } from "./obs/sourceSettings.js";
import { getInputKindSafe, listSceneItems, listScenes, listScenesForStudio } from "./obs/sceneInspection.js";
import { createBrowserSourceForStudio, createTextSourceForStudio } from "./obs/sourceCreate.js";
import { updateBrowserSourceForStudio, updateTextSourceForStudio } from "./obs/sourceUpdate.js";
import { applySceneItemTransformForStudio, getSceneItemTransformSafe } from "./obs/sceneItemTransform.js";
import { removeSceneItemForStudio, setSceneItemVisibilityForStudio } from "./obs/sceneItemLifecycle.js";
import { setSceneItemIndexForStudio } from "./obs/sceneItemIndex.js";

export class ObsClient {
  private obs = new OBSWebSocket();
  private readonly logFn?: (level: LogEntry["level"], message: string) => void;
  private readonly connectionState: ObsConnectionState = {
    connected: false,
    connectedUrl: null,
    connectedPassword: null,
    lastObsVersion: null,
    lastWebsocketVersion: null,
  };
  private mediaQueue: Promise<void> = Promise.resolve();

  constructor(logFn?: (level: LogEntry["level"], message: string) => void) {
    this.logFn = logFn;
  }

  getConnectionMetadata(): {
    obsConnected: boolean;
    obsVersion: string | null;
    websocketVersion: string | null;
  } {
    return getConnectionMetadata(this.connectionState);
  }

  async test(config: AgentConfig): Promise<ObsTestResult> {
    return testConnection(this.getConnectionContext(), config);
  }

  async getStatus(config: AgentConfig): Promise<ObsRelayGetStatusResult> {
    return getStatus(this.getConnectionContext(), config);
  }

  async listScenes(config: AgentConfig): Promise<ObsRelaySceneView[]> {
    return listScenes(this.getConnectionContext(), config);
  }

  async listSceneItems(config: AgentConfig, sceneName: string): Promise<ObsRelaySceneItem[]> {
    return listSceneItems(this.getConnectionContext(), config, sceneName);
  }

  async listScenesForStudio(config: AgentConfig): Promise<ObsRelayScenesListResult> {
    return listScenesForStudio(this.getConnectionContext(), config);
  }

  async listSceneItemsForStudio(config: AgentConfig, sceneName: string): Promise<ObsRelaySceneItemsListResult> {
    const normalizedSceneName = sceneName.trim();
    if (!normalizedSceneName.length) {
      throw new Error("sceneName is required.");
    }

    const items = await this.listSceneItems(config, normalizedSceneName);
    const enriched = await Promise.all(items.map(async item => ({
      sceneItemId: item.sceneItemId,
      sourceName: item.sourceName,
      inputKind: await getInputKindSafe(this.obs, this.log.bind(this), item.sourceName),
      enabled: item.enabled,
      transform: await getSceneItemTransformSafe(this.getConnectionContext(), normalizedSceneName, item.sceneItemId),
    })));

    return { sceneName: normalizedSceneName, items: enriched };
  }

  async setSceneItemIndexForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemIndexSetPayload,
  ): Promise<ObsRelaySceneItemIndexSetResult> {
    return setSceneItemIndexForStudio(this.getConnectionContext(), config, payload);
  }

  async createTextSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayTextSourceCreatePayload,
  ): Promise<ObsRelayTextSourceCreateResult> {
    return createTextSourceForStudio(this.getConnectionContext(), config, payload);
  }

  async updateTextSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayTextSourceUpdatePayload,
  ): Promise<ObsRelayTextSourceUpdateResult> {
    return updateTextSourceForStudio(this.getConnectionContext(), config, payload);
  }

  async createBrowserSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayBrowserSourceCreatePayload,
  ): Promise<ObsRelayBrowserSourceCreateResult> {
    return createBrowserSourceForStudio(this.getConnectionContext(), config, payload);
  }

  async updateBrowserSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayBrowserSourceUpdatePayload,
  ): Promise<ObsRelayBrowserSourceUpdateResult> {
    return updateBrowserSourceForStudio(this.getConnectionContext(), config, payload);
  }

  async setSceneItemVisibilityForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemVisibilitySetPayload,
  ): Promise<ObsRelaySceneItemVisibilitySetResult> {
    return setSceneItemVisibilityForStudio(this.getConnectionContext(), config, payload, this.listSceneItems.bind(this));
  }

  async removeSceneItemForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemRemovePayload,
  ): Promise<ObsRelaySceneItemRemoveResult> {
    return removeSceneItemForStudio(this.getConnectionContext(), config, payload, this.listSceneItems.bind(this));
  }

  async getSourceSettingsForStudio(
    config: AgentConfig,
    payload: ObsRelaySourceSettingsGetPayload,
  ): Promise<ObsRelaySourceSettingsGetResult> {
    return getSourceSettingsForStudio(this.getConnectionContext(), config, payload);
  }

  async applySceneItemTransformForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemTransformSetPayload,
  ): Promise<ObsRelaySceneItemTransformSetResult> {
    return applySceneItemTransformForStudio({
      context: this.getConnectionContext(),
      config,
      payload,
      listSceneItems: this.listSceneItems.bind(this),
    });
  }

  async switchScene(config: AgentConfig, sceneName: string): Promise<void> {
    await ensureConnected(this.getConnectionContext(), config);
    await this.obs.call("SetCurrentProgramScene", { sceneName });
  }

  async setSourceVisibility(config: AgentConfig, sceneName: string, sourceName: string, visible: boolean): Promise<void> {
    await ensureConnected(this.getConnectionContext(), config);
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
    await ensureConnected(this.getConnectionContext(), config);
    await this.obs.call("SetInputSettings", {
      inputName,
      inputSettings: { text },
      overlay: true,
    });
  }

  async triggerMediaInputAction(config: AgentConfig, inputName: string, mediaAction: ObsMediaAction): Promise<void> {
    await ensureConnected(this.getConnectionContext(), config);
    await this.obs.call("TriggerMediaInputAction", { inputName, mediaAction });
  }

  async showMediaOverlay(config: AgentConfig, media: ObsRelayMediaShowPayload): Promise<{ ok: true }> {
    return this.enqueueMediaTask(async () => {
      await ensureConnected(this.getConnectionContext(), config);
      return showMediaOverlay(this.getMediaOverlayContext(), media);
    });
  }

  async disconnect(): Promise<void> {
    await disconnectClient(this.getConnectionContext());
  }

  private async enqueueMediaTask(task: () => Promise<{ ok: true }>): Promise<{ ok: true }> {
    const runTask = async () => task();
    const queuedTask = this.mediaQueue.then(runTask, runTask);
    this.mediaQueue = queuedTask.then(() => undefined, () => undefined);
    return queuedTask;
  }

  private async callObsUnchecked<T>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    const call = this.obs.call.bind(this.obs) as unknown as (
      requestType: string,
      requestData?: Record<string, unknown>
    ) => Promise<T>;

    return call(requestType, requestData);
  }

  private getConnectionContext() {
    return {
      obs: this.obs,
      setObs: (obs: OBSWebSocket) => {
        this.obs = obs;
      },
      state: this.connectionState,
      log: this.log.bind(this),
      disconnect: this.disconnect.bind(this),
      ensureMediaOverlaySetupForCurrentScene: () => ensureMediaOverlaySetupForCurrentScene(this.getMediaOverlayContext()),
    };
  }

  private getMediaOverlayContext() {
    return {
      ...this.getConnectionContext(),
      callObsUnchecked: this.callObsUnchecked.bind(this),
    };
  }

  private log(level: LogEntry["level"], message: string): void {
    this.logFn?.(level, message);
  }
}
