export const MEDIA_GROUP_NAME = "Balkon Media Group";
export const MEDIA_IMAGE_SOURCE_NAME = "Balkon Media Image";
export const MEDIA_GIF_SOURCE_NAME = "Balkon Media GIF";
export const MEDIA_DEFAULT_URL = "about:blank";
export const TEXT_SOURCE_BASE_NAME = "Balkon Text";
export const TEXT_SOURCE_KINDS = ["text_gdiplus_v3", "text_gdiplus_v2", "text_gdiplus", "text_ft2_source_v2", "text_ft2_source"] as const;
export const BROWSER_SOURCE_BASE_NAME = "Balkon Browser";
export const BROWSER_SOURCE_KIND = "browser_source";
export const REQUIRED_GROUP_SETUP_REQUESTS = [
  "GetGroupList",
  "GetGroupSceneItemList",
  "GetSceneItemId",
  "CreateScene",
  "CreateSceneItem",
  "CreateInput",
  "SetSceneItemEnabled",
];
