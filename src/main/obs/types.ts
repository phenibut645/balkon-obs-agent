export interface ObsInputEntry {
  inputName?: string | null;
  inputKind?: string | null;
}

export interface ObsInputListResponse {
  inputs?: ObsInputEntry[];
}

export interface ObsCreateInputResponse {
  sceneItemId?: number;
}

export interface ObsCreateSceneResponse {
  sceneUuid?: string;
}

export interface ObsGetSceneItemIdResponse {
  sceneItemId?: number;
}

export interface ObsVersionResponse {
  obsVersion?: string | null;
  obsWebSocketVersion?: string | null;
  availableRequests?: string[] | null;
}

export interface ObsCurrentProgramSceneResponse {
  currentProgramSceneName?: string | null;
}

export interface ObsSceneListEntry {
  sceneName?: string | null;
}

export interface ObsSceneListResponse {
  scenes?: ObsSceneListEntry[];
  currentProgramSceneName?: string | null;
}

export interface ObsSceneItemEntry {
  sceneItemId?: number | null;
  sourceName?: string | null;
  sceneItemEnabled?: boolean | null;
  sceneItemIndex?: number | null;
  inputKind?: string | null;
}

export interface ObsSceneItemListResponse {
  sceneItems?: ObsSceneItemEntry[];
}

export interface ObsSceneItemTransformEntry {
  positionX?: number | null;
  positionY?: number | null;
  scaleX?: number | null;
  scaleY?: number | null;
  rotation?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface ObsGetSceneItemTransformResponse {
  sceneItemTransform?: ObsSceneItemTransformEntry | null;
}

export interface ObsGetInputSettingsResponse {
  inputKind?: string | null;
  inputSettings?: Record<string, unknown> | null;
}

export interface ObsGroupListResponse {
  groups?: string[];
}

export interface ObsConnectResponse {
  obsWebSocketVersion?: string | null;
}

export interface ObsMediaOverlaySetup {
  imageSceneItemId: number;
  gifSceneItemId: number;
  visibilitySceneName: string;
  grouped: boolean;
  groupSceneItemId: number | null;
}
