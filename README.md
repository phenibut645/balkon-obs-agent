# Balkon OBS Agent

Balkon OBS Agent is a standalone desktop app for streamers who need Balkon Discord commands to control their local OBS Studio. It connects outward to the Balkon OBS relay and then talks to OBS on the streamer's own Windows PC.

Streamers do not need to clone the main Discord bot repository or install bot/database dependencies. This project is intended to be packaged as its own Windows app.

## Install

```powershell
npm install
```

## Run In Development

```powershell
npm run dev
```

## Build

```powershell
npm run build
```

## Package Windows App

```powershell
npm run dist
```

The packaged installer is written to `release/`.

## Publish A Release

Balkon OBS Agent uses GitHub Releases for auto-updates.

1. Commit all code changes.
2. Bump the app version:

```powershell
npm version patch
```

3. Build the Windows installer:

```powershell
npm run dist
```

4. Create a GitHub Release with a tag that matches the version, for example `v0.1.1`.
5. Upload these files from `release/` to the GitHub Release:

```text
Balkon-OBS-Agent-Setup-0.1.1.exe
Balkon-OBS-Agent-Setup-0.1.1.exe.blockmap
latest.yml
```

The filename must be exactly `latest.yml`. Auto-updates will fail with a 404 if this asset is missing from the latest release.

Do not commit `release/`, `dist/`, `win-unpacked/`, or `.exe` files into git.

If you want Electron Builder to upload release assets directly, set `GH_TOKEN` to a GitHub token with release permissions and run:

```powershell
npm run dist:publish
```

Auto-update checks run only in the packaged app, not in `npm run dev`.

If a previous build is stuck during installation, close it first:

```powershell
taskkill /IM "Balkon OBS Agent.exe" /F
```

## Enable OBS WebSocket

1. Open OBS Studio.
2. Go to `Tools -> WebSocket Server Settings`.
3. Enable the WebSocket server.
4. Use port `4455`.
5. Set a password if you want one, or leave it empty.

## Get Agent Credentials In Discord

Register the streamer:

```text
/streamer register nickname:<nickname> primary:true
```

Generate the agent pairing credentials:

```text
/streamer agent_pair nickname:<nickname>
```

## App Configuration

Put these values into Balkon OBS Agent:

- Relay URL: `wss://venomancer.aleksandermilisenko23.thkit.ee/`
- Agent ID: from Discord
- Agent Token: from Discord
- OBS WebSocket URL: `ws://127.0.0.1:4455`
- OBS WebSocket Password: optional

Click `Save`, then `Connect`.

## Test

1. Click `Connect`.
2. Click `Test OBS`.
3. In Discord, use:

```text
/streamer agent_show nickname:<nickname>
/obs status
/obs scenes
/obs switch_scene scene_name:<scene>
```

## Notes

- The agent stores configuration in the local Electron user data directory.
- Do not commit real Agent Tokens.
- The app masks token/password inputs and does not print the full Agent Token in logs.

## Background / Tray Mode

Balkon OBS Agent runs as a system-tray application. When you close the window the app keeps running in the background. Right-click the tray icon to control it.

### Behavior Settings

| Setting | Description |
|---|---|
| **Start with Windows** | Registers the app as a login item so it launches automatically on Windows startup (hidden to tray). Has no effect in development mode. |
| **Start minimized to tray** | On launch, skip showing the main window and go directly to the tray. Useful together with "Start with Windows". |
| **Auto-connect on launch** | Automatically connect to the relay when the app starts, provided Agent ID and Token are already saved. |
| **Auto-retry OBS connection** | If OBS is not reachable when the relay connects, the agent waits and retries every 5 seconds until OBS comes online. Status shows as `waiting` while retrying. Only the first retry attempt is logged to avoid log spam. |

### Close vs Quit

- **Closing the window** hides it to the tray. The agent stays connected.
- **Quit** from the tray context menu fully exits the app and disconnects.

### Tray Context Menu

| Item | Action |
|---|---|
| Open | Show the main window |
| Connect | Connect to the relay (using saved config) |
| Disconnect | Disconnect from the relay |
| Check for Updates | Check GitHub Releases for a new version |
| Quit | Disconnect and exit |
