import { ObsRelayCommandName, RelayCommandDescriptor } from "./types.js";

export const SUPPORTED_RELAY_COMMANDS: RelayCommandDescriptor[] = [
  {
    command: "obs.getStatus",
    category: "Diagnostics",
    description: "Returns OBS connection status, current scene, and version details.",
  },
  {
    command: "obs.listScenes",
    category: "Legacy",
    description: "Legacy API to enumerate scenes using the older relay contract.",
  },
  {
    command: "obs.listSceneItems",
    category: "Legacy",
    description: "Legacy API to enumerate scene items via the older relay contract.",
  },
  {
    command: "obs.scenes.list",
    category: "Scene Inspection",
    description: "Lists OBS scenes with the current program scene highlighted for Streamer Studio.",
  },
  {
    command: "obs.scene.items.list",
    category: "Scene Inspection",
    description: "Lists scene items with transform snapshots and input kinds for Streamer Studio.",
  },
  {
    command: "obs.scene.item.transform.set",
    category: "Scene Item Control",
    description: "Updates the transform (position, scale, rotation) of a specific scene item.",
  },
  {
    command: "obs.scene.item.index.set",
    category: "Scene Item Control",
    description: "Reorders a scene item by setting its index within the scene stack.",
  },
  {
    command: "obs.scene.item.visibility.set",
    category: "Scene Item Control",
    description: "Toggles a scene item's enabled state within the selected scene.",
  },
  {
    command: "obs.scene.item.remove",
    category: "Scene Item Control",
    description: "Removes a scene item from the scene without deleting the underlying source.",
  },
  {
    command: "obs.scene.source.settings.get",
    category: "Source Inspection",
    description: "Reads editable source settings for text or browser sources to prefill the Streamer Studio inspector.",
  },
  {
    command: "obs.scene.source.text.create",
    category: "Source Creation",
    description: "Creates a new text source in a scene and returns the created scene item details.",
  },
  {
    command: "obs.scene.source.text.update",
    category: "Source Updates",
    description: "Updates the text content of an existing text source scene item.",
  },
  {
    command: "obs.scene.source.browser.create",
    category: "Source Creation",
    description: "Creates a new browser source in a scene and returns the created scene item details.",
  },
  {
    command: "obs.scene.source.browser.update",
    category: "Source Updates",
    description: "Updates the URL and dimensions for an existing browser source scene item.",
  },
  {
    command: "obs.switchScene",
    category: "Legacy",
    description: "Switches the active program scene through the legacy relay API.",
  },
  {
    command: "obs.setSourceVisibility",
    category: "Legacy",
    description: "Legacy API to toggle visibility for a source within a given scene.",
  },
  {
    command: "obs.setTextInputText",
    category: "Legacy",
    description: "Updates the text of an input directly by source name using the legacy command.",
  },
  {
    command: "obs.triggerMediaInputAction",
    category: "Legacy",
    description: "Triggers playback actions such as play or stop on media inputs via the legacy contract.",
  },
  {
    command: "obs.media.show",
    category: "Media Overlay",
    description: "Shows the configured media overlay (image or GIF) for a limited duration.",
  },
];

export const SUPPORTED_RELAY_COMMAND_NAME_SET: ReadonlySet<ObsRelayCommandName | string> = new Set(
  SUPPORTED_RELAY_COMMANDS.map(entry => entry.command),
);
