import { AgentConfig, ObsRelayBrowserSourceCreatePayload, ObsRelayBrowserSourceCreateResult, ObsRelayTextSourceCreatePayload, ObsRelayTextSourceCreateResult } from "../../shared/types.js";
import { BROWSER_SOURCE_KIND, TEXT_SOURCE_KINDS } from "./constants.js";
import { ensureConnected, ObsConnectionContext } from "./connection.js";
import { getSceneItemIndexList } from "./sceneItemIndex.js";
import { getSceneItemTransformSafe } from "./sceneItemTransform.js";
import { generateUniqueBrowserSourceName, generateUniqueTextSourceName, formatError } from "./obsUtils.js";
import { ObsCreateInputResponse, ObsInputListResponse, ObsSceneItemListResponse } from "./types.js";

export async function createTextSourceForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelayTextSourceCreatePayload,
): Promise<ObsRelayTextSourceCreateResult> {
  await ensureConnected(context, config);

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

  await context.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;

  const inputList = await context.obs.call("GetInputList") as ObsInputListResponse;
  const existingInputNames = new Set((inputList.inputs ?? [])
    .map(input => String(input.inputName ?? "").trim())
    .filter(Boolean));
  const sourceName = requestedSourceName || generateUniqueTextSourceName(existingInputNames);

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
        ? generateUniqueTextSourceName(existingInputNames)
        : sourceName;
      const result = await context.obs.call("CreateInput", {
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
      creationErrors.push(`${inputKind}: ${formatError(error)}`);
      context.log("warn", `CreateInput failed for text kind '${inputKind}': ${formatError(error)}`);
    }
  }

  if (!created) {
    throw new Error(`Unable to create OBS text source. Tried kinds: ${creationErrors.join("; ")}`);
  }

  await context.obs.call("SetSceneItemTransform", {
    sceneName,
    sceneItemId: created.sceneItemId,
    sceneItemTransform,
  });

  const transform = await getSceneItemTransformSafe(context, sceneName, created.sceneItemId);
  const items = await getSceneItemIndexList(context, sceneName);

  return {
    sceneName,
    sceneItemId: created.sceneItemId,
    sourceName: created.sourceName,
    inputKind: created.inputKind,
    transform,
    items,
  };
}

export async function createBrowserSourceForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelayBrowserSourceCreatePayload,
): Promise<ObsRelayBrowserSourceCreateResult> {
  await ensureConnected(context, config);

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

  const widthRaw = payload.width === undefined ? 800 : Number(payload.width);
  const heightRaw = payload.height === undefined ? 450 : Number(payload.height);
  if (!Number.isFinite(widthRaw) || !Number.isFinite(heightRaw)) {
    throw new Error("width and height must be finite numbers.");
  }
  const width = Math.min(3840, Math.max(64, Math.round(widthRaw)));
  const height = Math.min(2160, Math.max(64, Math.round(heightRaw)));

  const positionXRaw = payload.positionX === undefined ? 100 : Number(payload.positionX);
  const positionYRaw = payload.positionY === undefined ? 100 : Number(payload.positionY);
  const scaleXRaw = payload.scaleX === undefined ? 1 : Number(payload.scaleX);
  const scaleYRaw = payload.scaleY === undefined ? 1 : Number(payload.scaleY);
  const rotationRaw = payload.rotation === undefined ? 0 : Number(payload.rotation);

  if (!Number.isFinite(positionXRaw) || !Number.isFinite(positionYRaw) || !Number.isFinite(scaleXRaw) || !Number.isFinite(scaleYRaw) || !Number.isFinite(rotationRaw)) {
    throw new Error("position, scale, and rotation fields must be finite numbers.");
  }

  const sceneItemTransform = {
    positionX: Math.min(10000, Math.max(-10000, positionXRaw)),
    positionY: Math.min(10000, Math.max(-10000, positionYRaw)),
    scaleX: Math.min(10, Math.max(0.05, scaleXRaw)),
    scaleY: Math.min(10, Math.max(0.05, scaleYRaw)),
    rotation: Math.min(360, Math.max(-360, rotationRaw)),
  };

  await context.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;

  const inputList = await context.obs.call("GetInputList") as ObsInputListResponse;
  const existingInputNames = new Set((inputList.inputs ?? [])
    .map(input => String(input.inputName ?? "").trim())
    .filter(Boolean));

  let finalSourceName = requestedSourceName || generateUniqueBrowserSourceName(existingInputNames);
  let createdSceneItemId: number | null = null;
  let creationAttempt = 0;
  const maxAttempts = 3;

  while (creationAttempt < maxAttempts && createdSceneItemId === null) {
    creationAttempt += 1;
    try {
      if (existingInputNames.has(finalSourceName)) {
        finalSourceName = generateUniqueBrowserSourceName(existingInputNames);
      }

      const result = await context.obs.call("CreateInput", {
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
      context.log("warn", `CreateInput attempt ${creationAttempt} failed: ${errorMessage}`);

      if (creationAttempt >= maxAttempts) {
        throw new Error(`Unable to create browser source after ${maxAttempts} attempts: ${errorMessage}`);
      }

      finalSourceName = generateUniqueBrowserSourceName(existingInputNames);
    }
  }

  if (createdSceneItemId === null) {
    throw new Error("Failed to create browser source.");
  }

  try {
    await context.obs.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId: createdSceneItemId,
      sceneItemTransform,
    });
  } catch (error) {
    context.log("warn", `SetSceneItemTransform failed for browser source: ${formatError(error)}`);
  }

  const transform = await getSceneItemTransformSafe(context, sceneName, createdSceneItemId);
  const items = await getSceneItemIndexList(context, sceneName);

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
