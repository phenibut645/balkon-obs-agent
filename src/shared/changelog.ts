export interface ChangelogEntry {
  version: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.6",
    changes: [
      "Added tray mode.",
      "Added close-to-tray behavior.",
      "Added Start with Windows setting.",
      "Added Start minimized to tray setting.",
      "Added Auto-connect on launch setting.",
      "Added Auto-retry OBS connection setting.",
      "Added Waiting for OBS behavior and reconnect loop.",
      "Added tabbed UI with Main, Settings, and Changelog tabs.",
      "Added language support: English, Russian, Estonian.",
    ],
  },
  {
    version: "0.1.5",
    changes: [
      "Improved relay heartbeat stability.",
      "Added better compatibility with Balkon relay command_result responses.",
      "Improved OBS relay connection reliability.",
    ],
  },
  {
    version: "0.1.4",
    changes: ["Added app version display.", "Improved Relay and OBS status display.", "Improved OBS test flow."],
  },
  {
    version: "0.1.1",
    changes: [
      "Added auto-update support through GitHub Releases.",
      "Added Check Updates control.",
      "Added Restart to Update flow.",
    ],
  },
  {
    version: "0.1.0",
    changes: [
      "Initial standalone Balkon OBS Agent desktop app.",
      "Added relay connection.",
      "Added local OBS WebSocket connection.",
      "Added command execution from Discord bot relay.",
    ],
  },
];
