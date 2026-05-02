import OBSWebSocket from "obs-websocket-js";
import {
  AgentConfig,
  LogEntry,
  ObsMediaAction,
  ObsRelayMediaShowPayload,
  ObsRelayGetStatusResult,
  ObsRelaySceneItem,
  ObsRelaySceneItemIndexSetPayload,
  ObsRelaySceneItemIndexSetResult,
  ObsRelaySceneItemTransform,
  ObsRelaySceneItemTransformSetPayload,
  ObsRelaySceneItemTransformSetResult,
  ObsRelaySceneItemVisibilitySetPayload,
  ObsRelaySceneItemVisibilitySetResult,
  ObsRelaySceneItemRemovePayload,
  ObsRelaySceneItemRemoveResult,
  ObsRelaySceneItemsListResult,
  ObsRelayScenesListResult,
  ObsRelayTextSourceCreatePayload,
  ObsRelayTextSourceCreateResult,
  ObsRelayTextSourceUpdatePayload,
  ObsRelayTextSourceUpdateResult,
  ObsRelayBrowserSourceCreatePayload,
  ObsRelayBrowserSourceCreateResult,
  ObsRelayBrowserSourceUpdatePayload,
  ObsRelayBrowserSourceUpdateResult,
  ObsRelaySceneView,
  ObsTestResult,
} from "../shared/types.js";

const MEDIA_GROUP_NAME = "Balkon Media Group";
const MEDIA_IMAGE_SOURCE_NAME = "Balkon Media Image";
const MEDIA_GIF_SOURCE_NAME = "Balkon Media GIF";
const MEDIA_DEFAULT_URL = "about:blank";
const TEXT_SOURCE_BASE_NAME = "Balkon Text";
const TEXT_SOURCE_KINDS = ["text_gdiplus_v2", "text_gdiplus", "text_ft2_source_v2", "text_ft2_source"] as const;
const BROWSER_SOURCE_BASE_NAME = "Balkon Browser";
const BROWSER_SOURCE_KIND = "browser_source";
const REQUIRED_GROUP_SETUP_REQUESTS = [
  "GetGroupList",
  "GetGroupSceneItemList",
  "GetSceneItemId",
  "CreateScene",
  "CreateSceneItem",
  "CreateInput",
  "SetSceneItemEnabled",
];

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

interface ObsCreateSceneResponse {
  sceneUuid?: string;
}

interface ObsGetSceneItemIdResponse {
  sceneItemId?: number;
}

interface ObsVersionResponse {
  obsVersion?: string | null;
  obsWebSocketVersion?: string | null;
  availableRequests?: string[] | null;
}

interface ObsCurrentProgramSceneResponse {
  currentProgramSceneName?: string | null;
}

interface ObsSceneListEntry {
  sceneName?: string | null;
}

interface ObsSceneListResponse {
  scenes?: ObsSceneListEntry[];
  currentProgramSceneName?: string | null;
}

interface ObsSceneItemEntry {
  sceneItemId?: number | null;
  sourceName?: string | null;
  sceneItemEnabled?: boolean | null;
  sceneItemIndex?: number | null;
}

interface ObsSceneItemListResponse {
  sceneItems?: ObsSceneItemEntry[];
}

interface ObsSceneItemTransformEntry {
  positionX?: number | null;
  positionY?: number | null;
  scaleX?: number | null;
  scaleY?: number | null;
  rotation?: number | null;
  width?: number | null;
  height?: number | null;
}

interface ObsGetSceneItemTransformResponse {
  sceneItemTransform?: ObsSceneItemTransformEntry | null;
}

interface ObsGetInputSettingsResponse {
  inputKind?: string | null;
  inputSettings?: Record<string, unknown> | null;
}

interface ObsGroupListResponse {
  groups?: string[];
}

interface ObsConnectResponse {
  obsWebSocketVersion?: string | null;
}

interface ObsMediaOverlaySetup {
  imageSceneItemId: number;
  gifSceneItemId: number;
  visibilitySceneName: string;
  grouped: boolean;
  groupSceneItemId: number | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  async listScenesForStudio(config: AgentConfig): Promise<ObsRelayScenesListResult> {
    await this.ensureConnected(config);
    const sceneList = await this.obs.call("GetSceneList") as ObsSceneListResponse;

    const scenes = (sceneList.scenes ?? [])
      .map(scene => String(scene.sceneName ?? "").trim())
      .filter(Boolean)
      .map(name => ({ name }));

    let currentProgramSceneName: string | null = typeof sceneList.currentProgramSceneName === "string"
      ? sceneList.currentProgramSceneName.trim() || null
      : null;

    if (!currentProgramSceneName) {
      try {
        const current = await this.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
        currentProgramSceneName = typeof current.currentProgramSceneName === "string"
          ? current.currentProgramSceneName.trim() || null
          : null;
      } catch {
        currentProgramSceneName = null;
      }
    }

    return { scenes, currentProgramSceneName };
  }

  async listSceneItemsForStudio(config: AgentConfig, sceneName: string): Promise<ObsRelaySceneItemsListResult> {
    const normalizedSceneName = sceneName.trim();
    if (!normalizedSceneName.length) {
      throw new Error("sceneName is required.");
    }

    await this.ensureConnected(config);
    const result = await this.obs.call("GetSceneItemList", { sceneName: normalizedSceneName }) as ObsSceneItemListResponse;
    const items = (result.sceneItems ?? [])
      .map(item => ({
        sceneItemId: Number(item.sceneItemId ?? NaN),
        sourceName: String(item.sourceName ?? "").trim(),
        enabled: Boolean(item.sceneItemEnabled),
      }))
      .filter(item => Number.isFinite(item.sceneItemId) && item.sourceName.length > 0);

    const enriched = await Promise.all(items.map(async item => {
      const transform = await this.getSceneItemTransformSafe(normalizedSceneName, item.sceneItemId);
      const inputKind = await this.getInputKindSafe(item.sourceName);

      return {
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        inputKind,
        enabled: item.enabled,
        transform,
      };
    }));

    return {
      sceneName: normalizedSceneName,
      items: enriched,
    };
  }

  async setSceneItemIndexForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemIndexSetPayload,
  ): Promise<ObsRelaySceneItemIndexSetResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length) {
      throw new Error("sceneName is required.");
    }

    const sceneItemId = payload.sceneItemId;
    const sceneItemsResult = await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
    const sceneItems = (sceneItemsResult.sceneItems ?? [])
      .map((item, index) => ({
        sceneItemId: Number(item.sceneItemId ?? NaN),
        sourceName: String(item.sourceName ?? "").trim(),
        sceneItemIndex: Number(item.sceneItemIndex ?? index),
      }))
      .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0);

    const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
    if (!matchingItem) {
      throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
    }

    if (payload.sourceName && payload.sourceName.trim().length > 0) {
      const expected = payload.sourceName.trim().toLowerCase();
      const actual = matchingItem.sourceName.trim().toLowerCase();
      if (expected !== actual) {
        this.log(
          "warn",
          `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Applying index change anyway.`,
        );
      }
    }

    const maxIndex = Math.max(0, sceneItems.length - 1);
    const normalizedIndex = Math.min(maxIndex, Math.max(0, payload.sceneItemIndex));

    await this.obs.call("SetSceneItemIndex", {
      sceneName,
      sceneItemId,
      sceneItemIndex: normalizedIndex,
    });

    const refreshedResult = await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
    const refreshedItems = (refreshedResult.sceneItems ?? [])
      .map((item, index) => ({
        sceneItemId: Number(item.sceneItemId ?? NaN),
        sourceName: String(item.sourceName ?? "").trim(),
        sceneItemIndex: Number(item.sceneItemIndex ?? index),
      }))
      .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0)
      .map(item => ({
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        sceneItemIndex: Number.isInteger(item.sceneItemIndex) && item.sceneItemIndex >= 0 ? item.sceneItemIndex : 0,
      }));
    const refreshedTarget = refreshedItems.find(item => item.sceneItemId === sceneItemId) ?? null;

    return {
      sceneName,
      sceneItemId,
      sourceName: matchingItem.sourceName || null,
      sceneItemIndex: refreshedTarget?.sceneItemIndex ?? normalizedIndex,
      items: refreshedItems,
    };
  }

  async createTextSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayTextSourceCreatePayload,
  ): Promise<ObsRelayTextSourceCreateResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length || sceneName.length > 160) {
      throw new Error("sceneName must be a non-empty string up to 160 characters.");
    }

    const text = payload.text.trim();
    if (!text.length || text.length > 500) {
      throw new Error("text must be a non-empty string up to 500 characters.");
    }

    const requestedSourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
    if (requestedSourceName.length > 160) {
      throw new Error("sourceName must be 160 characters or fewer.");
    }

    await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;

    const inputList = await this.obs.call("GetInputList") as ObsInputListResponse;
    const existingInputNames = new Set((inputList.inputs ?? [])
      .map(input => String(input.inputName ?? "").trim())
      .filter(Boolean));
    const sourceName = requestedSourceName || this.generateUniqueTextSourceName(existingInputNames);

    const sceneItemTransform = {
      positionX: payload.positionX ?? 100,
      positionY: payload.positionY ?? 100,
      scaleX: payload.scaleX ?? 1,
      scaleY: payload.scaleY ?? 1,
      rotation: payload.rotation ?? 0,
    };

    let created: { sceneItemId: number; inputKind: string; sourceName: string } | null = null;
    const creationErrors: string[] = [];

    for (const inputKind of TEXT_SOURCE_KINDS) {
      try {
        const candidateName = existingInputNames.has(sourceName)
          ? this.generateUniqueTextSourceName(existingInputNames)
          : sourceName;
        const result = await this.obs.call("CreateInput", {
          sceneName,
          inputName: candidateName,
          inputKind,
          inputSettings: { text },
          sceneItemEnabled: true,
        }) as ObsCreateInputResponse;

        const sceneItemId = Number(result.sceneItemId ?? NaN);
        if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
          throw new Error("OBS did not return a created sceneItemId.");
        }

        existingInputNames.add(candidateName);
        created = { sceneItemId, inputKind, sourceName: candidateName };
        break;
      } catch (error) {
        creationErrors.push(`${inputKind}: ${this.formatError(error)}`);
        this.log("warn", `CreateInput failed for text kind '${inputKind}': ${this.formatError(error)}`);
      }
    }

    if (!created) {
      throw new Error(`Unable to create OBS text source. Tried kinds: ${creationErrors.join("; ")}`);
    }

    await this.obs.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId: created.sceneItemId,
      sceneItemTransform,
    });

    const transform = await this.getSceneItemTransformSafe(sceneName, created.sceneItemId);
    const items = await this.getSceneItemIndexList(sceneName);

    return {
      sceneName,
      sceneItemId: created.sceneItemId,
      sourceName: created.sourceName,
      inputKind: created.inputKind,
      transform,
      items,
    };
  }

  async updateTextSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayTextSourceUpdatePayload,
  ): Promise<ObsRelayTextSourceUpdateResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length || sceneName.length > 160) {
      throw new Error("sceneName must be a non-empty string up to 160 characters.");
    }

    const sceneItemId = payload.sceneItemId;
    if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
      throw new Error("sceneItemId must be a positive integer.");
    }

    const providedSourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
    if (providedSourceName.length > 160) {
      throw new Error("sourceName must be 160 characters or fewer.");
    }

    const rawText = typeof payload.text === "string" ? payload.text : "";
    const normalizedText = rawText.trim();
    if (!normalizedText.length || normalizedText.length > 500) {
      throw new Error("text must be a non-empty string up to 500 characters.");
    }

    const sceneItems = await this.listSceneItems(config, sceneName);
    const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
    if (!matchingItem) {
      throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
    }

    if (providedSourceName.length > 0) {
      const expected = providedSourceName.toLowerCase();
      const actual = matchingItem.sourceName.trim().toLowerCase();
      if (expected !== actual) {
        this.log(
          "warn",
          `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${providedSourceName}', got '${matchingItem.sourceName}'. Updating text anyway.`,
        );
      }
    }

    const sourceName = matchingItem.sourceName.trim();
    let inputKind: string | null = null;

    try {
      const inputInfo = await this.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
      const kindRaw = typeof inputInfo.inputKind === "string" ? inputInfo.inputKind.trim() : "";
      if (kindRaw.length) {
        inputKind = kindRaw;
      }

      if (inputKind && !TEXT_SOURCE_KINDS.includes(inputKind as (typeof TEXT_SOURCE_KINDS)[number])) {
        throw new Error(`Source '${sourceName}' is not a supported text input (kind: ${inputKind}).`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Source")) {
        throw error;
      }
      this.log("warn", `GetInputSettings failed for text source '${sourceName}': ${this.formatError(error)}`);
    }

    await this.obs.call("SetInputSettings", {
      inputName: sourceName,
      inputSettings: { text: normalizedText },
      overlay: true,
    });

    let finalText = normalizedText;
    try {
      const refreshed = await this.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
      const kindRaw = typeof refreshed.inputKind === "string" ? refreshed.inputKind.trim() : "";
      if (!inputKind && kindRaw.length) {
        inputKind = kindRaw;
      }

      if (isPlainObject(refreshed.inputSettings)) {
        const textValue = refreshed.inputSettings.text;
        if (typeof textValue === "string") {
          finalText = textValue;
        }
      }
    } catch (error) {
      this.log("warn", `GetInputSettings after text update failed for '${sourceName}': ${this.formatError(error)}`);
    }

    inputKind = inputKind && inputKind.length ? inputKind : null;

    return {
      sceneName,
      sceneItemId,
      sourceName,
      inputKind,
      text: finalText,
    };
  }

  async createBrowserSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayBrowserSourceCreatePayload,
  ): Promise<ObsRelayBrowserSourceCreateResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length || sceneName.length > 160) {
      throw new Error("sceneName must be a non-empty string up to 160 characters.");
    }

    const url = payload.url.trim();
    if (!url.length || url.length > 1000) {
      throw new Error("url must be a non-empty string up to 1000 characters.");
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("url must be a valid http:// or https:// URL.");
    }

    const requestedSourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
    if (requestedSourceName.length > 160) {
      throw new Error("sourceName must be 160 characters or fewer.");
    }

    // Validate and clamp width/height
    const widthRaw = payload.width === undefined ? 800 : Number(payload.width);
    const heightRaw = payload.height === undefined ? 450 : Number(payload.height);
    if (!Number.isFinite(widthRaw) || !Number.isFinite(heightRaw)) {
      throw new Error("width and height must be finite numbers.");
    }
    const width = Math.min(3840, Math.max(64, Math.round(widthRaw)));
    const height = Math.min(2160, Math.max(64, Math.round(heightRaw)));

    // Validate and clamp transform values
    const positionXRaw = payload.positionX === undefined ? 100 : Number(payload.positionX);
    const positionYRaw = payload.positionY === undefined ? 100 : Number(payload.positionY);
    const scaleXRaw = payload.scaleX === undefined ? 1 : Number(payload.scaleX);
    const scaleYRaw = payload.scaleY === undefined ? 1 : Number(payload.scaleY);
    const rotationRaw = payload.rotation === undefined ? 0 : Number(payload.rotation);

    if (!Number.isFinite(positionXRaw) || !Number.isFinite(positionYRaw) ||
        !Number.isFinite(scaleXRaw) || !Number.isFinite(scaleYRaw) || !Number.isFinite(rotationRaw)) {
      throw new Error("position, scale, and rotation fields must be finite numbers.");
    }

    const sceneItemTransform = {
      positionX: Math.min(10000, Math.max(-10000, positionXRaw)),
      positionY: Math.min(10000, Math.max(-10000, positionYRaw)),
      scaleX: Math.min(10, Math.max(0.05, scaleXRaw)),
      scaleY: Math.min(10, Math.max(0.05, scaleYRaw)),
      rotation: Math.min(360, Math.max(-360, rotationRaw)),
    };

    // Verify scene exists
    await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;

    // Get existing input names to avoid duplicates
    const inputList = await this.obs.call("GetInputList") as ObsInputListResponse;
    const existingInputNames = new Set((inputList.inputs ?? [])
      .map(input => String(input.inputName ?? "").trim())
      .filter(Boolean));

    // Determine final source name
    let finalSourceName = requestedSourceName || this.generateUniqueBrowserSourceName(existingInputNames);

    // Create the browser source
    let createdSceneItemId: number | null = null;
    let creationAttempt = 0;
    const maxAttempts = 3;

    while (creationAttempt < maxAttempts && createdSceneItemId === null) {
      creationAttempt++;
      try {
        // If name exists, generate a new unique name
        if (existingInputNames.has(finalSourceName)) {
          finalSourceName = this.generateUniqueBrowserSourceName(existingInputNames);
        }

        const result = await this.obs.call("CreateInput", {
          sceneName,
          inputName: finalSourceName,
          inputKind: BROWSER_SOURCE_KIND,
          inputSettings: {
            url,
            width,
            height,
          },
          sceneItemEnabled: true,
        }) as ObsCreateInputResponse;

        const sceneItemId = Number(result.sceneItemId ?? NaN);
        if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
          throw new Error("OBS did not return a valid sceneItemId.");
        }

        createdSceneItemId = sceneItemId;
        existingInputNames.add(finalSourceName);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log("warn", `CreateInput attempt ${creationAttempt} failed: ${errorMessage}`);

        if (creationAttempt >= maxAttempts) {
          throw new Error(`Unable to create browser source after ${maxAttempts} attempts: ${errorMessage}`);
        }

        // Try with a new generated name on next iteration
        finalSourceName = this.generateUniqueBrowserSourceName(existingInputNames);
      }
    }

    if (createdSceneItemId === null) {
      throw new Error("Failed to create browser source.");
    }

    // Apply transform
    try {
      await this.obs.call("SetSceneItemTransform", {
        sceneName,
        sceneItemId: createdSceneItemId,
        sceneItemTransform,
      });
    } catch (error) {
      this.log("warn", `SetSceneItemTransform failed for browser source: ${this.formatError(error)}`);
      // Continue even if transform fails - source was created
    }

    // Get final transform and scene items list
    const transform = await this.getSceneItemTransformSafe(sceneName, createdSceneItemId);
    const items = await this.getSceneItemIndexList(sceneName);

    return {
      sceneName,
      sceneItemId: createdSceneItemId,
      sourceName: finalSourceName,
      inputKind: BROWSER_SOURCE_KIND,
      url,
      width,
      height,
      transform,
      items,
    };
  }

  async updateBrowserSourceForStudio(
    config: AgentConfig,
    payload: ObsRelayBrowserSourceUpdatePayload,
  ): Promise<ObsRelayBrowserSourceUpdateResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length || sceneName.length > 160) {
      throw new Error("sceneName must be a non-empty string up to 160 characters.");
    }

    const sceneItemId = payload.sceneItemId;
    if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
      throw new Error("sceneItemId must be a positive integer.");
    }

    const providedSourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
    if (providedSourceName.length > 160) {
      throw new Error("sourceName must be 160 characters or fewer.");
    }

    const rawUrl = payload.url;
    let normalizedUrl: string | undefined;
    if (rawUrl !== undefined && rawUrl !== null) {
      if (typeof rawUrl !== "string") {
        throw new Error("url must be a string when provided.");
      }
      const trimmedUrl = rawUrl.trim();
      if (!trimmedUrl.length || trimmedUrl.length > 1000) {
        throw new Error("url must be a non-empty string up to 1000 characters.");
      }
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        throw new Error("url must be a valid http:// or https:// URL.");
      }
      normalizedUrl = trimmedUrl;
    }

    const widthRaw = payload.width === undefined || payload.width === null ? undefined : Number(payload.width);
    if (widthRaw !== undefined && (!Number.isFinite(widthRaw))) {
      throw new Error("width must be a finite number.");
    }

    const heightRaw = payload.height === undefined || payload.height === null ? undefined : Number(payload.height);
    if (heightRaw !== undefined && (!Number.isFinite(heightRaw))) {
      throw new Error("height must be a finite number.");
    }

    if (normalizedUrl === undefined && widthRaw === undefined && heightRaw === undefined) {
      throw new Error("At least one of url, width, or height must be provided.");
    }

    const normalizedWidth = widthRaw === undefined ? undefined : Math.min(3840, Math.max(64, Math.round(widthRaw)));
    const normalizedHeight = heightRaw === undefined ? undefined : Math.min(2160, Math.max(64, Math.round(heightRaw)));

    const sceneItems = await this.listSceneItems(config, sceneName);
    const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
    if (!matchingItem) {
      throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
    }

    if (providedSourceName.length > 0) {
      const expected = providedSourceName.toLowerCase();
      const actual = matchingItem.sourceName.trim().toLowerCase();
      if (expected !== actual) {
        this.log(
          "warn",
          `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${providedSourceName}', got '${matchingItem.sourceName}'. Updating browser source anyway.`,
        );
      }
    }

    const sourceName = matchingItem.sourceName.trim();
    let inputKind: string | null = null;
    let fallbackUrl: string | undefined;
    let fallbackWidth: number | undefined;
    let fallbackHeight: number | undefined;

    try {
      const inputInfo = await this.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
      const kindRaw = typeof inputInfo.inputKind === "string" ? inputInfo.inputKind.trim() : "";
      if (kindRaw.length) {
        inputKind = kindRaw;
      }

      if (inputKind && inputKind !== BROWSER_SOURCE_KIND) {
        throw new Error(`Source '${sourceName}' is not a browser source (kind: ${inputKind}).`);
      }

      if (isPlainObject(inputInfo.inputSettings)) {
        const urlValue = inputInfo.inputSettings.url;
        if (typeof urlValue === "string") {
          fallbackUrl = urlValue;
        }

        const widthValue = inputInfo.inputSettings.width;
        if (typeof widthValue === "number" && Number.isFinite(widthValue)) {
          fallbackWidth = widthValue;
        }

        const heightValue = inputInfo.inputSettings.height;
        if (typeof heightValue === "number" && Number.isFinite(heightValue)) {
          fallbackHeight = heightValue;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Source")) {
        throw error;
      }
      this.log("warn", `GetInputSettings failed for browser source '${sourceName}': ${this.formatError(error)}`);
    }

    const nextSettings: Record<string, unknown> = {};
    if (normalizedUrl !== undefined) {
      nextSettings.url = normalizedUrl;
    }
    if (normalizedWidth !== undefined) {
      nextSettings.width = normalizedWidth;
    }
    if (normalizedHeight !== undefined) {
      nextSettings.height = normalizedHeight;
    }

    await this.obs.call("SetInputSettings", {
      inputName: sourceName,
      inputSettings: nextSettings,
      overlay: true,
    });

    let finalUrl = normalizedUrl ?? fallbackUrl;
    let finalWidth = normalizedWidth ?? fallbackWidth;
    let finalHeight = normalizedHeight ?? fallbackHeight;

    try {
      const refreshed = await this.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
      const kindRaw = typeof refreshed.inputKind === "string" ? refreshed.inputKind.trim() : "";
      if (!inputKind && kindRaw.length) {
        inputKind = kindRaw;
      }

      if (isPlainObject(refreshed.inputSettings)) {
        const urlValue = refreshed.inputSettings.url;
        if (typeof urlValue === "string") {
          finalUrl = urlValue;
        }

        const widthValue = refreshed.inputSettings.width;
        if (typeof widthValue === "number" && Number.isFinite(widthValue)) {
          finalWidth = widthValue;
        }

        const heightValue = refreshed.inputSettings.height;
        if (typeof heightValue === "number" && Number.isFinite(heightValue)) {
          finalHeight = heightValue;
        }
      }
    } catch (error) {
      this.log("warn", `GetInputSettings after browser update failed for '${sourceName}': ${this.formatError(error)}`);
    }

    inputKind = inputKind && inputKind.length ? inputKind : null;

    return {
      sceneName,
      sceneItemId,
      sourceName,
      inputKind,
      url: finalUrl,
      width: finalWidth,
      height: finalHeight,
    };
  }

  async setSceneItemVisibilityForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemVisibilitySetPayload,
  ): Promise<ObsRelaySceneItemVisibilitySetResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length) {
      throw new Error("sceneName is required.");
    }

    const sceneItemId = payload.sceneItemId;
    if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
      throw new Error("sceneItemId must be a positive integer.");
    }

    const enabled = Boolean(payload.enabled);

    // Fetch scene items and find the target
    const sceneItems = await this.listSceneItems(config, sceneName);
    const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
    if (!matchingItem) {
      throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
    }

    // Check sourceName mismatch if provided
    if (payload.sourceName && payload.sourceName.trim().length > 0) {
      const expected = payload.sourceName.trim().toLowerCase();
      const actual = matchingItem.sourceName.trim().toLowerCase();
      if (expected !== actual) {
        this.log(
          "warn",
          `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Setting visibility anyway.`,
        );
      }
    }

    // Set visibility
    await this.obs.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId,
      sceneItemEnabled: enabled,
    });

    // Refresh item list
    const items = await this.getSceneItemIndexList(sceneName);

    // Get updated enabled state from refreshed list if available
    const refreshedItem = items.find(item => item.sceneItemId === sceneItemId);
    const finalEnabled = refreshedItem ? Boolean((refreshedItem as { enabled?: boolean }).enabled ?? enabled) : enabled;

    return {
      sceneName,
      sceneItemId,
      sourceName: matchingItem.sourceName || null,
      enabled: finalEnabled,
      items: items.map(item => ({
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        sceneItemIndex: item.sceneItemIndex,
        enabled: (item as { enabled?: boolean }).enabled,
      })),
    };
  }

  async removeSceneItemForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemRemovePayload,
  ): Promise<ObsRelaySceneItemRemoveResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length) {
      throw new Error("sceneName is required.");
    }

    const sceneItemId = payload.sceneItemId;
    if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
      throw new Error("sceneItemId must be a positive integer.");
    }

    // Fetch scene items and find the target
    const sceneItems = await this.listSceneItems(config, sceneName);
    const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
    if (!matchingItem) {
      throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
    }

    // Check sourceName mismatch if provided
    if (payload.sourceName && payload.sourceName.trim().length > 0) {
      const expected = payload.sourceName.trim().toLowerCase();
      const actual = matchingItem.sourceName.trim().toLowerCase();
      if (expected !== actual) {
        this.log(
          "warn",
          `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Removing anyway.`,
        );
      }
    }

    // Remove the scene item (removes from scene, not global input deletion)
    await this.obs.call("RemoveSceneItem", {
      sceneName,
      sceneItemId,
    });

    // Refresh item list
    const items = await this.getSceneItemIndexList(sceneName);

    return {
      sceneName,
      sceneItemId,
      sourceName: matchingItem.sourceName || null,
      removed: true,
      items: items.map(item => ({
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        sceneItemIndex: item.sceneItemIndex,
        enabled: (item as { enabled?: boolean }).enabled,
      })),
    };
  }

  async applySceneItemTransformForStudio(
    config: AgentConfig,
    payload: ObsRelaySceneItemTransformSetPayload,
  ): Promise<ObsRelaySceneItemTransformSetResult> {
    await this.ensureConnected(config);

    const sceneName = payload.sceneName.trim();
    if (!sceneName.length) {
      throw new Error("sceneName is required.");
    }

    const sceneItemId = payload.sceneItemId;
    const sceneItems = await this.listSceneItems(config, sceneName);
    const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
    if (!matchingItem) {
      throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
    }

    if (payload.sourceName && payload.sourceName.trim().length > 0) {
      const expected = payload.sourceName.trim().toLowerCase();
      const actual = matchingItem.sourceName.trim().toLowerCase();
      if (expected !== actual) {
        this.log(
          "warn",
          `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Applying transform anyway.`,
        );
      }
    }

    await this.obs.call("GetSceneItemTransform", {
      sceneName,
      sceneItemId,
    }) as ObsGetSceneItemTransformResponse;
    const nextTransform = {
      positionX: payload.transform.positionX,
      positionY: payload.transform.positionY,
      scaleX: payload.transform.scaleX,
      scaleY: payload.transform.scaleY,
      rotation: payload.transform.rotation ?? 0,
    };

    await this.obs.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: nextTransform,
    });

    let finalTransform: ObsRelaySceneItemTransform;
    try {
      finalTransform = await this.getSceneItemTransformSafe(sceneName, sceneItemId);
    } catch {
      finalTransform = {
        positionX: payload.transform.positionX,
        positionY: payload.transform.positionY,
        scaleX: payload.transform.scaleX,
        scaleY: payload.transform.scaleY,
        rotation: payload.transform.rotation ?? 0,
      };
    }

    return {
      sceneName,
      sceneItemId,
      sourceName: matchingItem.sourceName || null,
      transform: finalTransform,
    };
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

      if (setup.grouped && setup.groupSceneItemId !== null) {
        await this.obs.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: setup.groupSceneItemId,
          sceneItemEnabled: true,
        });
      }

      await this.obs.call("SetSceneItemEnabled", {
        sceneName: setup.visibilitySceneName,
        sceneItemId: otherSceneItemId,
        sceneItemEnabled: false,
      });

      this.log("info", `Showing media source '${sourceName}' in ${setup.grouped ? `group '${MEDIA_GROUP_NAME}'` : `scene '${sceneName}'`}.`);

      await this.obs.call("SetSceneItemEnabled", {
        sceneName: setup.visibilitySceneName,
        sceneItemId: targetSceneItemId,
        sceneItemEnabled: true,
      });

      try {
        await this.sleep(media.durationMs);
      } finally {
        this.log("info", `Hiding media source '${sourceName}' in ${setup.grouped ? `group '${MEDIA_GROUP_NAME}'` : `scene '${sceneName}'`}.`);
        await this.obs.call("SetSceneItemEnabled", {
          sceneName: setup.visibilitySceneName,
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

  private generateUniqueTextSourceName(existingInputNames: Set<string>): string {
    if (!existingInputNames.has(TEXT_SOURCE_BASE_NAME)) {
      return TEXT_SOURCE_BASE_NAME;
    }

    for (let i = 2; i < 10_000; i += 1) {
      const candidate = `${TEXT_SOURCE_BASE_NAME} ${i}`;
      if (!existingInputNames.has(candidate)) {
        return candidate;
      }
    }

    return `${TEXT_SOURCE_BASE_NAME} ${Date.now()}`;
  }

  private generateUniqueBrowserSourceName(existingInputNames: Set<string>): string {
    if (!existingInputNames.has(BROWSER_SOURCE_BASE_NAME)) {
      return BROWSER_SOURCE_BASE_NAME;
    }

    for (let i = 2; i < 10_000; i += 1) {
      const candidate = `${BROWSER_SOURCE_BASE_NAME} ${i}`;
      if (!existingInputNames.has(candidate)) {
        return candidate;
      }
    }

    return `${BROWSER_SOURCE_BASE_NAME} ${Date.now()}`;
  }

  private async getSceneItemIndexList(sceneName: string): Promise<Array<{ sceneItemId: number; sourceName: string; sceneItemIndex: number }>> {
    const result = await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
    return (result.sceneItems ?? [])
      .map((item, index) => ({
        sceneItemId: Number(item.sceneItemId ?? NaN),
        sourceName: String(item.sourceName ?? "").trim(),
        sceneItemIndex: Number(item.sceneItemIndex ?? index),
      }))
      .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0)
      .map(item => ({
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        sceneItemIndex: Number.isInteger(item.sceneItemIndex) && item.sceneItemIndex >= 0 ? item.sceneItemIndex : 0,
      }));
  }

  private async getSceneItemTransformSafe(sceneName: string, sceneItemId: number): Promise<{
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    width?: number;
    height?: number;
  }> {
    try {
      const response = await this.obs.call("GetSceneItemTransform", {
        sceneName,
        sceneItemId,
      }) as ObsGetSceneItemTransformResponse;

      const t = response.sceneItemTransform ?? null;
      const positionX = Number(t?.positionX ?? 0);
      const positionY = Number(t?.positionY ?? 0);
      const scaleX = Number(t?.scaleX ?? 1);
      const scaleY = Number(t?.scaleY ?? 1);
      const rotation = Number(t?.rotation ?? 0);
      const width = t?.width === null || t?.width === undefined ? undefined : Number(t.width);
      const height = t?.height === null || t?.height === undefined ? undefined : Number(t.height);

      const base = {
        positionX: Number.isFinite(positionX) ? positionX : 0,
        positionY: Number.isFinite(positionY) ? positionY : 0,
        scaleX: Number.isFinite(scaleX) ? scaleX : 1,
        scaleY: Number.isFinite(scaleY) ? scaleY : 1,
        rotation: Number.isFinite(rotation) ? rotation : 0,
      };

      const out: {
        positionX: number;
        positionY: number;
        scaleX: number;
        scaleY: number;
        rotation: number;
        width?: number;
        height?: number;
      } = { ...base };

      if (width !== undefined && Number.isFinite(width)) {
        out.width = width;
      }
      if (height !== undefined && Number.isFinite(height)) {
        out.height = height;
      }

      return out;
    } catch (error) {
      this.log("warn", `GetSceneItemTransform failed for ${sceneName}#${sceneItemId}: ${this.formatError(error)}`);
      return {
        positionX: 0,
        positionY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      };
    }
  }

  private async getInputKindSafe(inputName: string): Promise<string | null> {
    try {
      const response = await this.obs.call("GetInputSettings", { inputName }) as ObsGetInputSettingsResponse;
      const kind = typeof response.inputKind === "string" ? response.inputKind.trim() : "";
      return kind.length ? kind : null;
    } catch (error) {
      // groups/scenes can fail here; do not fail the entire command
      this.log("warn", `GetInputSettings failed for '${inputName}': ${this.formatError(error)}`);
      return null;
    }
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

  private async ensureMediaOverlaySetup(sceneName: string): Promise<ObsMediaOverlaySetup> {
    const availableRequests = await this.getAvailableRequests();
    const groupedSetup = await this.tryEnsureGroupedMediaOverlaySetup(sceneName, availableRequests);
    if (groupedSetup) {
      this.log("info", `Using grouped media overlay in '${MEDIA_GROUP_NAME}'.`);
      return groupedSetup;
    }

    this.log("info", "Using fallback scene media overlay.");
    const image = await this.ensureMediaBrowserSource(sceneName, MEDIA_IMAGE_SOURCE_NAME);
    const gif = await this.ensureMediaBrowserSource(sceneName, MEDIA_GIF_SOURCE_NAME);
    return {
      imageSceneItemId: image.sceneItemId,
      gifSceneItemId: gif.sceneItemId,
      visibilitySceneName: sceneName,
      grouped: false,
      groupSceneItemId: null,
    };
  }

  private async tryEnsureGroupedMediaOverlaySetup(sceneName: string, availableRequests: Set<string>): Promise<ObsMediaOverlaySetup | null> {
    const missingRequests = this.getMissingRequests(availableRequests, REQUIRED_GROUP_SETUP_REQUESTS);
    if (missingRequests.length > 0) {
      this.logGroupSetupUnavailable(availableRequests, missingRequests);
      return null;
    }

    try {
      this.log("info", "OBS group API uses CreateScene with isGroup=true; CreateGroup is not required.");
      await this.ensureMediaGroupExists();

      const groupSceneItemId = await this.ensureMediaGroupSceneItem(sceneName);
      const image = await this.ensureMediaBrowserSourceInGroup(sceneName, MEDIA_IMAGE_SOURCE_NAME);
      const gif = await this.ensureMediaBrowserSourceInGroup(sceneName, MEDIA_GIF_SOURCE_NAME);

      return {
        imageSceneItemId: image.sceneItemId,
        gifSceneItemId: gif.sceneItemId,
        visibilitySceneName: MEDIA_GROUP_NAME,
        grouped: true,
        groupSceneItemId,
      };
    } catch (error) {
      this.log("warn", `Unable to use '${MEDIA_GROUP_NAME}' safely: ${this.formatError(error)} Using scene sources fallback.`);
      return null;
    }
  }

  private async ensureMediaGroupExists(): Promise<void> {
    const groupList = await this.obs.call("GetGroupList") as ObsGroupListResponse;
    const groupExists = (groupList.groups ?? []).some(groupName => groupName === MEDIA_GROUP_NAME);
    if (groupExists) {
      this.log("info", `Media group '${MEDIA_GROUP_NAME}' exists.`);
      return;
    }

    try {
      await this.callObsUnchecked<ObsCreateSceneResponse>("CreateScene", {
        sceneName: MEDIA_GROUP_NAME,
        isGroup: true,
      });
      this.log("info", `Media group '${MEDIA_GROUP_NAME}' created.`);
    } catch (error) {
      throw new Error(`CreateScene with isGroup=true failed: ${this.formatError(error)}`);
    }
  }

  private async ensureMediaGroupSceneItem(sceneName: string): Promise<number> {
    const existingGroupSceneItemId = await this.findSceneItemId(sceneName, MEDIA_GROUP_NAME);
    if (existingGroupSceneItemId !== null) {
      this.log("info", `Media group '${MEDIA_GROUP_NAME}' exists in scene '${sceneName}'.`);
      return existingGroupSceneItemId;
    }

    const createdSceneItem = await this.obs.call("CreateSceneItem", {
      sceneName,
      sourceName: MEDIA_GROUP_NAME,
      sceneItemEnabled: true,
    }) as ObsCreateInputResponse;

    const createdSceneItemId = Number(createdSceneItem.sceneItemId ?? NaN);
    if (!Number.isFinite(createdSceneItemId)) {
      throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to place group '${MEDIA_GROUP_NAME}' in scene '${sceneName}'.`);
    }

    this.log("info", `Media group '${MEDIA_GROUP_NAME}' added to scene '${sceneName}'.`);
    return createdSceneItemId;
  }

  private async ensureMediaBrowserSourceInGroup(sceneName: string, sourceName: string): Promise<{ sceneItemId: number }> {
    const [inputList, existingGroupSceneItemId, existingSceneSceneItemId] = await Promise.all([
      this.obs.call("GetInputList") as Promise<ObsInputListResponse>,
      this.findGroupSceneItemId(sourceName),
      this.findSceneItemId(sceneName, sourceName),
    ]);

    const inputExists = (inputList.inputs ?? []).some(input => String(input.inputName ?? "") === sourceName);

    if (!inputExists) {
      try {
        const created = await this.obs.call("CreateInput", {
          sceneName: MEDIA_GROUP_NAME,
          inputName: sourceName,
          inputKind: "browser_source",
          inputSettings: this.getMediaOverlaySettings(MEDIA_DEFAULT_URL),
          sceneItemEnabled: false,
        }) as ObsCreateInputResponse;

        const createdSceneItemId = Number(created.sceneItemId ?? NaN);
        if (!Number.isFinite(createdSceneItemId)) {
          throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to create source '${sourceName}' in group '${MEDIA_GROUP_NAME}'.`);
        }

        this.log("info", `${sourceName} created in group '${MEDIA_GROUP_NAME}'.`);
        return { sceneItemId: createdSceneItemId };
      } catch (error) {
        this.log("warn", `${sourceName} could not be created in group '${MEDIA_GROUP_NAME}': ${this.formatError(error)}`);
        throw error;
      }
    }

    if (existingGroupSceneItemId !== null) {
      await this.obs.call("SetSceneItemEnabled", {
        sceneName: MEDIA_GROUP_NAME,
        sceneItemId: existingGroupSceneItemId,
        sceneItemEnabled: false,
      });
      this.log("info", `${sourceName} exists in group '${MEDIA_GROUP_NAME}'.`);
      return { sceneItemId: existingGroupSceneItemId };
    }

    let createdSceneItemId: number;
    try {
      const createdSceneItem = await this.obs.call("CreateSceneItem", {
        sceneName: MEDIA_GROUP_NAME,
        sourceName,
        sceneItemEnabled: false,
      }) as ObsCreateInputResponse;

      createdSceneItemId = Number(createdSceneItem.sceneItemId ?? NaN);
      if (!Number.isFinite(createdSceneItemId)) {
        throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to add source '${sourceName}' to group '${MEDIA_GROUP_NAME}'.`);
      }
    } catch (error) {
      this.log("warn", `${sourceName} exists outside '${MEDIA_GROUP_NAME}', but adding it to the group is not supported safely: ${this.formatError(error)}`);
      throw error;
    }

    if (existingSceneSceneItemId !== null) {
      await this.obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: existingSceneSceneItemId,
        sceneItemEnabled: false,
      });
      this.log("info", `${sourceName} exists outside '${MEDIA_GROUP_NAME}' and was left in place hidden.`);
    }

    this.log("info", `${sourceName} added to group '${MEDIA_GROUP_NAME}'.`);
    return { sceneItemId: createdSceneItemId };
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

      this.log("info", `${sourceName} created in scene '${sceneName}'.`);
      return { sceneItemId: createdSceneItemId };
    }

    if (existingSceneItemId !== null) {
      await this.obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: existingSceneItemId,
        sceneItemEnabled: false,
      });
      this.log("info", `${sourceName} exists in scene '${sceneName}'.`);
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

    this.log("info", `${sourceName} added to scene '${sceneName}'.`);
    return { sceneItemId: createdSceneItemId };
  }

  private async getAvailableRequests(): Promise<Set<string>> {
    const version = await this.obs.call("GetVersion") as ObsVersionResponse;
    this.lastObsVersion = version.obsVersion ?? null;
    this.lastWebsocketVersion = version.obsWebSocketVersion ?? this.lastWebsocketVersion;
    return new Set(version.availableRequests ?? []);
  }

  private getMissingRequests(availableRequests: Set<string>, requestNames: string[]): string[] {
    return requestNames.filter(requestName => !availableRequests.has(requestName));
  }

  private logGroupSetupUnavailable(availableRequests: Set<string>, missingRequests: string[]): void {
    const missing = missingRequests.length > 0 ? missingRequests.join(", ") : "none";
    const obsVersion = this.lastObsVersion ?? "unknown";
    const websocketVersion = this.lastWebsocketVersion ?? "unknown";
    this.log(
      "warn",
      `OBS group setup unavailable. Missing requests: ${missing}. OBS ${obsVersion}, obs-websocket ${websocketVersion}. Using scene sources fallback.`,
    );
  }

  private async callObsUnchecked<T>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    const call = this.obs.call.bind(this.obs) as unknown as (
      requestType: string,
      requestData?: Record<string, unknown>
    ) => Promise<T>;

    return call(requestType, requestData);
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

  private async findGroupSceneItemId(sourceName: string): Promise<number | null> {
    try {
      const result = await this.obs.call("GetGroupSceneItemList", {
        sceneName: MEDIA_GROUP_NAME,
      }) as ObsSceneItemListResponse;

      const targetItem = (result.sceneItems ?? []).find(item => item.sourceName === sourceName);
      const sceneItemId = Number(targetItem?.sceneItemId ?? NaN);
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

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private log(level: LogEntry["level"], message: string): void {
    this.logFn?.(level, message);
  }
}
