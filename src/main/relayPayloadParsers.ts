import {
  ObsRelayBrowserSourceCreatePayload,
  ObsRelayBrowserSourceUpdatePayload,
  ObsRelaySceneItemIndexSetPayload,
  ObsRelaySceneItemRemovePayload,
  ObsRelaySceneItemTransformSetPayload,
  ObsRelaySceneItemVisibilitySetPayload,
  ObsRelaySourceSettingsGetPayload,
  ObsRelayTextSourceCreatePayload,
  ObsRelayTextSourceUpdatePayload,
} from "../shared/types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getStringPayload(payload: Record<string, unknown> | undefined, primary: string, fallback?: string, allowEmpty = false): string {
  const value = payload?.[primary] ?? (fallback ? payload?.[fallback] : undefined);
  if (typeof value !== "string") {
    throw new Error(`Missing required field '${primary}'.`);
  }

  if (!allowEmpty && !value.trim().length) {
    throw new Error(`Missing required field '${primary}'.`);
  }

  return allowEmpty ? value : value.trim();
}

export function getBooleanPayload(payload: Record<string, unknown> | undefined, fieldName: string): boolean {
  const value = payload?.[fieldName];
  if (typeof value !== "boolean") {
    throw new Error(`Missing required boolean field '${fieldName}'.`);
  }

  return value;
}

export function getNumberPayload(payload: Record<string, unknown> | undefined, fieldName: string): number {
  const value = payload?.[fieldName];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing required number field '${fieldName}'.`);
  }

  return value;
}

export function getOptionalNumberPayload(payload: Record<string, unknown> | undefined, fieldName: string): number | undefined {
  const value = payload?.[fieldName];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid number field '${fieldName}'.`);
  }
  return value;
}

export function getOptionalStringPayload(payload: Record<string, unknown> | undefined, fieldName: string): string | null | undefined {
  const value = payload?.[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid field '${fieldName}'.`);
  }
  return value.trim();
}

export function parseTextSourceUpdatePayload(payload: Record<string, unknown> | undefined): ObsRelayTextSourceUpdatePayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const sceneItemIdRaw = getNumberPayload(payload, "sceneItemId");
  if (!Number.isInteger(sceneItemIdRaw) || sceneItemIdRaw <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const text = getStringPayload(payload, "text");
  if (text.length > 500) {
    throw new Error("text must be 500 characters or fewer.");
  }

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  return {
    sceneName,
    sceneItemId: sceneItemIdRaw,
    sourceName,
    text,
  };
}

export function parseBrowserSourceUpdatePayload(payload: Record<string, unknown> | undefined): ObsRelayBrowserSourceUpdatePayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const sceneItemIdRaw = getNumberPayload(payload, "sceneItemId");
  if (!Number.isInteger(sceneItemIdRaw) || sceneItemIdRaw <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  const rawUrl = getOptionalStringPayload(payload, "url");
  let url: string | undefined;
  if (typeof rawUrl === "string") {
    if (rawUrl.length > 1000) {
      throw new Error("url must be 1000 characters or fewer.");
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
      throw new Error("url must be a valid http:// or https:// URL.");
    }
    url = rawUrl;
  }

  const widthRaw = getOptionalNumberPayload(payload, "width");
  const heightRaw = getOptionalNumberPayload(payload, "height");

  const width = widthRaw === undefined ? undefined : clampNumber(Math.round(widthRaw), 64, 3840);
  const height = heightRaw === undefined ? undefined : clampNumber(Math.round(heightRaw), 64, 2160);

  if (url === undefined && width === undefined && height === undefined) {
    throw new Error("At least one of url, width, or height must be provided.");
  }

  return {
    sceneName,
    sceneItemId: sceneItemIdRaw,
    sourceName,
    url,
    width,
    height,
  };
}

export function parseTextSourceCreatePayload(payload: Record<string, unknown> | undefined): ObsRelayTextSourceCreatePayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const text = getStringPayload(payload, "text");
  if (text.length > 500) {
    throw new Error("text must be 500 characters or fewer.");
  }

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  const positionXRaw = getOptionalNumberPayload(payload, "positionX");
  const positionYRaw = getOptionalNumberPayload(payload, "positionY");
  const scaleXRaw = getOptionalNumberPayload(payload, "scaleX");
  const scaleYRaw = getOptionalNumberPayload(payload, "scaleY");
  const rotationRaw = getOptionalNumberPayload(payload, "rotation");

  return {
    sceneName,
    sourceName,
    text,
    positionX: positionXRaw === undefined ? undefined : clampNumber(positionXRaw, -10_000, 10_000),
    positionY: positionYRaw === undefined ? undefined : clampNumber(positionYRaw, -10_000, 10_000),
    scaleX: scaleXRaw === undefined ? undefined : clampNumber(scaleXRaw, 0.05, 10),
    scaleY: scaleYRaw === undefined ? undefined : clampNumber(scaleYRaw, 0.05, 10),
    rotation: rotationRaw === undefined ? undefined : clampNumber(rotationRaw, -360, 360),
  };
}

export function parseBrowserSourceCreatePayload(payload: Record<string, unknown> | undefined): ObsRelayBrowserSourceCreatePayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const url = getStringPayload(payload, "url");
  if (url.length > 1000) {
    throw new Error("url must be 1000 characters or fewer.");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("url must be a valid http:// or https:// URL.");
  }

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  const widthRaw = getOptionalNumberPayload(payload, "width");
  const heightRaw = getOptionalNumberPayload(payload, "height");
  const positionXRaw = getOptionalNumberPayload(payload, "positionX");
  const positionYRaw = getOptionalNumberPayload(payload, "positionY");
  const scaleXRaw = getOptionalNumberPayload(payload, "scaleX");
  const scaleYRaw = getOptionalNumberPayload(payload, "scaleY");
  const rotationRaw = getOptionalNumberPayload(payload, "rotation");

  return {
    sceneName,
    sourceName,
    url,
    width: widthRaw === undefined ? undefined : clampNumber(Math.round(widthRaw), 64, 3840),
    height: heightRaw === undefined ? undefined : clampNumber(Math.round(heightRaw), 64, 2160),
    positionX: positionXRaw === undefined ? undefined : clampNumber(positionXRaw, -10_000, 10_000),
    positionY: positionYRaw === undefined ? undefined : clampNumber(positionYRaw, -10_000, 10_000),
    scaleX: scaleXRaw === undefined ? undefined : clampNumber(scaleXRaw, 0.05, 10),
    scaleY: scaleYRaw === undefined ? undefined : clampNumber(scaleYRaw, 0.05, 10),
    rotation: rotationRaw === undefined ? undefined : clampNumber(rotationRaw, -360, 360),
  };
}

export function parseSceneItemTransformSetPayload(payload: Record<string, unknown> | undefined): ObsRelaySceneItemTransformSetPayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const sceneItemIdRaw = getNumberPayload(payload, "sceneItemId");
  if (!Number.isInteger(sceneItemIdRaw) || sceneItemIdRaw <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const transformValue = payload?.transform;
  if (!isRecord(transformValue)) {
    throw new Error("Missing required object field 'transform'.");
  }

  const positionX = clampNumber(getNumberPayload(transformValue, "positionX"), -10_000, 10_000);
  const positionY = clampNumber(getNumberPayload(transformValue, "positionY"), -10_000, 10_000);
  const scaleX = clampNumber(getNumberPayload(transformValue, "scaleX"), 0.05, 10);
  const scaleY = clampNumber(getNumberPayload(transformValue, "scaleY"), 0.05, 10);
  const rotation = transformValue.rotation === undefined ? 0 : clampNumber(getNumberPayload(transformValue, "rotation"), -360, 360);

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 0 && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  return {
    sceneName,
    sceneItemId: sceneItemIdRaw,
    sourceName,
    transform: {
      positionX,
      positionY,
      scaleX,
      scaleY,
      rotation,
    },
  };
}

export function parseSceneItemIndexSetPayload(payload: Record<string, unknown> | undefined): ObsRelaySceneItemIndexSetPayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const sceneItemIdRaw = getNumberPayload(payload, "sceneItemId");
  if (!Number.isInteger(sceneItemIdRaw) || sceneItemIdRaw <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const sceneItemIndexRaw = getNumberPayload(payload, "sceneItemIndex");
  if (!Number.isInteger(sceneItemIndexRaw) || sceneItemIndexRaw < 0) {
    throw new Error("sceneItemIndex must be an integer greater than or equal to 0.");
  }

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 0 && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  return {
    sceneName,
    sceneItemId: sceneItemIdRaw,
    sourceName,
    sceneItemIndex: sceneItemIndexRaw,
  };
}

export function parseSceneItemVisibilitySetPayload(payload: Record<string, unknown> | undefined): ObsRelaySceneItemVisibilitySetPayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const sceneItemIdRaw = getNumberPayload(payload, "sceneItemId");
  if (!Number.isInteger(sceneItemIdRaw) || sceneItemIdRaw <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const enabled = getBooleanPayload(payload, "enabled");

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 0 && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  return {
    sceneName,
    sceneItemId: sceneItemIdRaw,
    sourceName,
    enabled,
  };
}

export function parseSceneItemRemovePayload(payload: Record<string, unknown> | undefined): ObsRelaySceneItemRemovePayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const sceneItemIdRaw = getNumberPayload(payload, "sceneItemId");
  if (!Number.isInteger(sceneItemIdRaw) || sceneItemIdRaw <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 0 && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  return {
    sceneName,
    sceneItemId: sceneItemIdRaw,
    sourceName,
  };
}

export function parseSourceSettingsGetPayload(payload: Record<string, unknown> | undefined): ObsRelaySourceSettingsGetPayload {
  const sceneName = getStringPayload(payload, "sceneName");
  if (sceneName.length > 160) {
    throw new Error("sceneName must be 160 characters or fewer.");
  }

  const sceneItemIdRaw = getNumberPayload(payload, "sceneItemId");
  if (!Number.isInteger(sceneItemIdRaw) || sceneItemIdRaw <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const sourceName = getOptionalStringPayload(payload, "sourceName");
  if (typeof sourceName === "string" && sourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  return {
    sceneName,
    sceneItemId: sceneItemIdRaw,
    sourceName,
  };
}
