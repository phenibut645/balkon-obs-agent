import { AgentConfig, LogEntry, ObsRelaySceneItemTransform, ObsRelaySceneItemTransformSetPayload, ObsRelaySceneItemTransformSetResult } from "../../shared/types.js";
import { ensureConnected, ObsConnectionContext } from "./connection.js";
import { ObsGetSceneItemTransformResponse } from "./types.js";
import { formatError } from "./obsUtils.js";

export async function getSceneItemTransformSafe(
  context: Pick<ObsConnectionContext, "obs" | "log">,
  sceneName: string,
  sceneItemId: number,
): Promise<ObsRelaySceneItemTransform> {
  try {
    const response = await context.obs.call("GetSceneItemTransform", {
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

    const out: ObsRelaySceneItemTransform = {
      positionX: Number.isFinite(positionX) ? positionX : 0,
      positionY: Number.isFinite(positionY) ? positionY : 0,
      scaleX: Number.isFinite(scaleX) ? scaleX : 1,
      scaleY: Number.isFinite(scaleY) ? scaleY : 1,
      rotation: Number.isFinite(rotation) ? rotation : 0,
    };

    if (width !== undefined && Number.isFinite(width)) {
      out.width = width;
    }
    if (height !== undefined && Number.isFinite(height)) {
      out.height = height;
    }

    return out;
  } catch (error) {
    context.log("warn", `GetSceneItemTransform failed for ${sceneName}#${sceneItemId}: ${formatError(error)}`);
    return {
      positionX: 0,
      positionY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    };
  }
}

type ApplySceneItemTransformForStudioOptions = {
  context: ObsConnectionContext;
  config: AgentConfig;
  payload: ObsRelaySceneItemTransformSetPayload;
  listSceneItems: (config: AgentConfig, sceneName: string) => Promise<Array<{ sceneItemId: number; sourceName: string }>>;
};

export async function applySceneItemTransformForStudio({
  context,
  config,
  payload,
  listSceneItems,
}: ApplySceneItemTransformForStudioOptions): Promise<ObsRelaySceneItemTransformSetResult> {
  await ensureConnected(context, config);

  const sceneName = payload.sceneName.trim();
  if (!sceneName.length) {
    throw new Error("sceneName is required.");
  }

  const sceneItemId = payload.sceneItemId;
  const sceneItems = await listSceneItems(config, sceneName);
  const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
  if (!matchingItem) {
    throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
  }

  if (payload.sourceName && payload.sourceName.trim().length > 0) {
    const expected = payload.sourceName.trim().toLowerCase();
    const actual = matchingItem.sourceName.trim().toLowerCase();
    if (expected !== actual) {
      context.log(
        "warn",
        `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Applying transform anyway.`,
      );
    }
  }

  await context.obs.call("GetSceneItemTransform", {
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

  await context.obs.call("SetSceneItemTransform", {
    sceneName,
    sceneItemId,
    sceneItemTransform: nextTransform,
  });

  let finalTransform: ObsRelaySceneItemTransform;
  try {
    finalTransform = await getSceneItemTransformSafe(context, sceneName, sceneItemId);
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
