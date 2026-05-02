import { LogEntry, ObsRelayMediaShowPayload } from "../../shared/types.js";
import {
  MEDIA_DEFAULT_URL,
  MEDIA_GIF_SOURCE_NAME,
  MEDIA_GROUP_NAME,
  MEDIA_IMAGE_SOURCE_NAME,
  REQUIRED_GROUP_SETUP_REQUESTS,
} from "./constants.js";
import { getAvailableRequests, ObsConnectionContext } from "./connection.js";
import { ObsCreateInputResponse, ObsCreateSceneResponse, ObsCurrentProgramSceneResponse, ObsGroupListResponse, ObsInputListResponse, ObsMediaOverlaySetup, ObsSceneItemListResponse } from "./types.js";
import { formatError, getMediaOverlaySettings, sleep } from "./obsUtils.js";

export type MediaOverlayContext = ObsConnectionContext & {
  callObsUnchecked: <T>(requestType: string, requestData?: Record<string, unknown>) => Promise<T>;
};

export function validateMediaPayload(media: ObsRelayMediaShowPayload): void {
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

export function getMissingRequests(availableRequests: Set<string>, requestNames: string[]): string[] {
  return requestNames.filter(requestName => !availableRequests.has(requestName));
}

export function logGroupSetupUnavailable(
  log: (level: LogEntry["level"], message: string) => void,
  obsVersion: string | null,
  websocketVersion: string | null,
  availableRequests: Set<string>,
  missingRequests: string[],
): void {
  void availableRequests;
  const missing = missingRequests.length > 0 ? missingRequests.join(", ") : "none";
  log(
    "warn",
    `OBS group setup unavailable. Missing requests: ${missing}. OBS ${obsVersion ?? "unknown"}, obs-websocket ${websocketVersion ?? "unknown"}. Using scene sources fallback.`,
  );
}

export async function showMediaOverlay(
  context: MediaOverlayContext,
  media: ObsRelayMediaShowPayload,
): Promise<{ ok: true }> {
  validateMediaPayload(media);

  const currentScene = await context.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
  const sceneName = String(currentScene.currentProgramSceneName ?? "").trim();
  if (!sceneName) {
    throw new Error("OBS_MEDIA_SHOW_FAILED: Current program scene is not available.");
  }

  const setup = await ensureMediaOverlaySetup(context, sceneName);
  const sourceName = media.kind === "gif" ? MEDIA_GIF_SOURCE_NAME : MEDIA_IMAGE_SOURCE_NAME;
  const targetSceneItemId = media.kind === "gif" ? setup.gifSceneItemId : setup.imageSceneItemId;
  const otherSceneItemId = media.kind === "gif" ? setup.imageSceneItemId : setup.gifSceneItemId;

  await context.obs.call("SetInputSettings", {
    inputName: sourceName,
    inputSettings: getMediaOverlaySettings(media.url),
    overlay: true,
  });

  if (setup.grouped && setup.groupSceneItemId !== null) {
    await context.obs.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: setup.groupSceneItemId,
      sceneItemEnabled: true,
    });
  }

  await context.obs.call("SetSceneItemEnabled", {
    sceneName: setup.visibilitySceneName,
    sceneItemId: otherSceneItemId,
    sceneItemEnabled: false,
  });

  context.log("info", `Showing media source '${sourceName}' in ${setup.grouped ? `group '${MEDIA_GROUP_NAME}'` : `scene '${sceneName}'`}.`);

  await context.obs.call("SetSceneItemEnabled", {
    sceneName: setup.visibilitySceneName,
    sceneItemId: targetSceneItemId,
    sceneItemEnabled: true,
  });

  try {
    await sleep(media.durationMs);
  } finally {
    context.log("info", `Hiding media source '${sourceName}' in ${setup.grouped ? `group '${MEDIA_GROUP_NAME}'` : `scene '${sceneName}'`}.`);
    await context.obs.call("SetSceneItemEnabled", {
      sceneName: setup.visibilitySceneName,
      sceneItemId: targetSceneItemId,
      sceneItemEnabled: false,
    });
  }

  return { ok: true };
}

export async function ensureMediaOverlaySetupForCurrentScene(context: MediaOverlayContext): Promise<void> {
  const currentScene = await context.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
  const sceneName = String(currentScene.currentProgramSceneName ?? "").trim();
  if (!sceneName) {
    return;
  }

  await ensureMediaOverlaySetup(context, sceneName);
}

export async function ensureMediaOverlaySetup(context: MediaOverlayContext, sceneName: string): Promise<ObsMediaOverlaySetup> {
  const availableRequests = await getAvailableRequests(context);
  const groupedSetup = await tryEnsureGroupedMediaOverlaySetup(context, sceneName, availableRequests);
  if (groupedSetup) {
    context.log("info", `Using grouped media overlay in '${MEDIA_GROUP_NAME}'.`);
    return groupedSetup;
  }

  context.log("info", "Using fallback scene media overlay.");
  const image = await ensureMediaBrowserSource(context, sceneName, MEDIA_IMAGE_SOURCE_NAME);
  const gif = await ensureMediaBrowserSource(context, sceneName, MEDIA_GIF_SOURCE_NAME);
  return {
    imageSceneItemId: image.sceneItemId,
    gifSceneItemId: gif.sceneItemId,
    visibilitySceneName: sceneName,
    grouped: false,
    groupSceneItemId: null,
  };
}

async function tryEnsureGroupedMediaOverlaySetup(
  context: MediaOverlayContext,
  sceneName: string,
  availableRequests: Set<string>,
): Promise<ObsMediaOverlaySetup | null> {
  const missingRequests = getMissingRequests(availableRequests, REQUIRED_GROUP_SETUP_REQUESTS);
  if (missingRequests.length > 0) {
    logGroupSetupUnavailable(context.log, context.state.lastObsVersion, context.state.lastWebsocketVersion, availableRequests, missingRequests);
    return null;
  }

  try {
    context.log("info", "OBS group API uses CreateScene with isGroup=true; CreateGroup is not required.");
    await ensureMediaGroupExists(context);

    const groupSceneItemId = await ensureMediaGroupSceneItem(context, sceneName);
    const image = await ensureMediaBrowserSourceInGroup(context, sceneName, MEDIA_IMAGE_SOURCE_NAME);
    const gif = await ensureMediaBrowserSourceInGroup(context, sceneName, MEDIA_GIF_SOURCE_NAME);

    return {
      imageSceneItemId: image.sceneItemId,
      gifSceneItemId: gif.sceneItemId,
      visibilitySceneName: MEDIA_GROUP_NAME,
      grouped: true,
      groupSceneItemId,
    };
  } catch (error) {
    context.log("warn", `Unable to use '${MEDIA_GROUP_NAME}' safely: ${formatError(error)} Using scene sources fallback.`);
    return null;
  }
}

async function ensureMediaGroupExists(context: MediaOverlayContext): Promise<void> {
  const groupList = await context.obs.call("GetGroupList") as ObsGroupListResponse;
  const groupExists = (groupList.groups ?? []).some(groupName => groupName === MEDIA_GROUP_NAME);
  if (groupExists) {
    context.log("info", `Media group '${MEDIA_GROUP_NAME}' exists.`);
    return;
  }

  try {
    await context.callObsUnchecked<ObsCreateSceneResponse>("CreateScene", {
      sceneName: MEDIA_GROUP_NAME,
      isGroup: true,
    });
    context.log("info", `Media group '${MEDIA_GROUP_NAME}' created.`);
  } catch (error) {
    throw new Error(`CreateScene with isGroup=true failed: ${formatError(error)}`);
  }
}

async function ensureMediaGroupSceneItem(context: MediaOverlayContext, sceneName: string): Promise<number> {
  const existingGroupSceneItemId = await findSceneItemId(context, sceneName, MEDIA_GROUP_NAME);
  if (existingGroupSceneItemId !== null) {
    context.log("info", `Media group '${MEDIA_GROUP_NAME}' exists in scene '${sceneName}'.`);
    return existingGroupSceneItemId;
  }

  const createdSceneItem = await context.obs.call("CreateSceneItem", {
    sceneName,
    sourceName: MEDIA_GROUP_NAME,
    sceneItemEnabled: true,
  }) as ObsCreateInputResponse;

  const createdSceneItemId = Number(createdSceneItem.sceneItemId ?? NaN);
  if (!Number.isFinite(createdSceneItemId)) {
    throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to place group '${MEDIA_GROUP_NAME}' in scene '${sceneName}'.`);
  }

  context.log("info", `Media group '${MEDIA_GROUP_NAME}' added to scene '${sceneName}'.`);
  return createdSceneItemId;
}

async function ensureMediaBrowserSourceInGroup(context: MediaOverlayContext, sceneName: string, sourceName: string): Promise<{ sceneItemId: number }> {
  const [inputList, existingGroupSceneItemId, existingSceneSceneItemId] = await Promise.all([
    context.obs.call("GetInputList") as Promise<ObsInputListResponse>,
    findGroupSceneItemId(context, sourceName),
    findSceneItemId(context, sceneName, sourceName),
  ]);

  const inputExists = (inputList.inputs ?? []).some(input => String(input.inputName ?? "") === sourceName);

  if (!inputExists) {
    try {
      const created = await context.obs.call("CreateInput", {
        sceneName: MEDIA_GROUP_NAME,
        inputName: sourceName,
        inputKind: "browser_source",
        inputSettings: getMediaOverlaySettings(MEDIA_DEFAULT_URL),
        sceneItemEnabled: false,
      }) as ObsCreateInputResponse;

      const createdSceneItemId = Number(created.sceneItemId ?? NaN);
      if (!Number.isFinite(createdSceneItemId)) {
        throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to create source '${sourceName}' in group '${MEDIA_GROUP_NAME}'.`);
      }

      context.log("info", `${sourceName} created in group '${MEDIA_GROUP_NAME}'.`);
      return { sceneItemId: createdSceneItemId };
    } catch (error) {
      context.log("warn", `${sourceName} could not be created in group '${MEDIA_GROUP_NAME}': ${formatError(error)}`);
      throw error;
    }
  }

  if (existingGroupSceneItemId !== null) {
    await context.obs.call("SetSceneItemEnabled", {
      sceneName: MEDIA_GROUP_NAME,
      sceneItemId: existingGroupSceneItemId,
      sceneItemEnabled: false,
    });
    context.log("info", `${sourceName} exists in group '${MEDIA_GROUP_NAME}'.`);
    return { sceneItemId: existingGroupSceneItemId };
  }

  let createdSceneItemId: number;
  try {
    const createdSceneItem = await context.obs.call("CreateSceneItem", {
      sceneName: MEDIA_GROUP_NAME,
      sourceName,
      sceneItemEnabled: false,
    }) as ObsCreateInputResponse;

    createdSceneItemId = Number(createdSceneItem.sceneItemId ?? NaN);
    if (!Number.isFinite(createdSceneItemId)) {
      throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to add source '${sourceName}' to group '${MEDIA_GROUP_NAME}'.`);
    }
  } catch (error) {
    context.log("warn", `${sourceName} exists outside '${MEDIA_GROUP_NAME}', but adding it to the group is not supported safely: ${formatError(error)}`);
    throw error;
  }

  if (existingSceneSceneItemId !== null) {
    await context.obs.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: existingSceneSceneItemId,
      sceneItemEnabled: false,
    });
    context.log("info", `${sourceName} exists outside '${MEDIA_GROUP_NAME}' and was left in place hidden.`);
  }

  context.log("info", `${sourceName} added to group '${MEDIA_GROUP_NAME}'.`);
  return { sceneItemId: createdSceneItemId };
}

async function ensureMediaBrowserSource(context: MediaOverlayContext, sceneName: string, sourceName: string): Promise<{ sceneItemId: number }> {
  const [inputList, existingSceneItemId] = await Promise.all([
    context.obs.call("GetInputList") as Promise<ObsInputListResponse>,
    findSceneItemId(context, sceneName, sourceName),
  ]);

  const inputExists = (inputList.inputs ?? []).some(input => String(input.inputName ?? "") === sourceName);

  if (!inputExists) {
    const created = await context.obs.call("CreateInput", {
      sceneName,
      inputName: sourceName,
      inputKind: "browser_source",
      inputSettings: getMediaOverlaySettings(MEDIA_DEFAULT_URL),
      sceneItemEnabled: false,
    }) as ObsCreateInputResponse;

    const createdSceneItemId = Number(created.sceneItemId ?? NaN);
    if (!Number.isFinite(createdSceneItemId)) {
      throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to create source '${sourceName}'.`);
    }

    context.log("info", `${sourceName} created in scene '${sceneName}'.`);
    return { sceneItemId: createdSceneItemId };
  }

  if (existingSceneItemId !== null) {
    await context.obs.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: existingSceneItemId,
      sceneItemEnabled: false,
    });
    context.log("info", `${sourceName} exists in scene '${sceneName}'.`);
    return { sceneItemId: existingSceneItemId };
  }

  const createdSceneItem = await context.obs.call("CreateSceneItem", {
    sceneName,
    sourceName,
    sceneItemEnabled: false,
  }) as ObsCreateInputResponse;

  const createdSceneItemId = Number(createdSceneItem.sceneItemId ?? NaN);
  if (!Number.isFinite(createdSceneItemId)) {
    throw new Error(`OBS_MEDIA_SETUP_FAILED: Unable to place source '${sourceName}' in scene '${sceneName}'.`);
  }

  context.log("info", `${sourceName} added to scene '${sceneName}'.`);
  return { sceneItemId: createdSceneItemId };
}

async function findSceneItemId(context: MediaOverlayContext, sceneName: string, sourceName: string): Promise<number | null> {
  try {
    const result = await context.obs.call("GetSceneItemId", {
      sceneName,
      sourceName,
    }) as { sceneItemId?: number };

    const sceneItemId = Number(result.sceneItemId ?? NaN);
    return Number.isFinite(sceneItemId) ? sceneItemId : null;
  } catch {
    return null;
  }
}

async function findGroupSceneItemId(context: MediaOverlayContext, sourceName: string): Promise<number | null> {
  try {
    const result = await context.obs.call("GetGroupSceneItemList", {
      sceneName: MEDIA_GROUP_NAME,
    }) as ObsSceneItemListResponse;

    const targetItem = (result.sceneItems ?? []).find(item => item.sourceName === sourceName);
    const sceneItemId = Number(targetItem?.sceneItemId ?? NaN);
    return Number.isFinite(sceneItemId) ? sceneItemId : null;
  } catch {
    return null;
  }
}
