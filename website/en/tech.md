# Tech notes

## Stack

- Built on **Electron** with a bundled **Node v24.19.0**
- Runs the DeepSeek Harness Web UI via `@deepseek-ai/dsh@0.1.0-rc.6`
- Native frameless window (drawn title bar) that keeps full window semantics: resizing, Aero Snap, Win11 Snap Layouts

## Data & directories

| Item | Location |
| --- | --- |
| App data | `%USERPROFILE%\.dsh` |
| WebView2 user data | `%LOCALAPPDATA%\dsh-desktop\WebView2` |

## Key features

- Frameless window with a drawn title bar (36px: whale glyph, app name, service status dot)
- System tray (open main window / start on boot / about / quit)
- Native Windows notifications
- Single-instance mode
- First-run API key onboarding (key stays on this machine)
- Service port auto-assigned by the system (port 0) — no manual configuration

## Architecture notes

- Closing the window hides to the tray; a single WebView instance lives for the whole session, so reopening is instant
- The shell never injects styles or scripts into the WebView — no scrolling, no overlays, no DOM access
- Service health is polled on a 1s interval, redrawing only the 6px status dot in the title bar

## Version

Current release: `v0.2.0`. DeepSeek Harness is still in developer preview and may introduce breaking changes in future versions.
