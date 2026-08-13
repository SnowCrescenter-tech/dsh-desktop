# Window & system tray

dsh-desktop wraps the DeepSeek Harness Web UI in a native Windows window. The interface is unchanged — it just gets a friendlier shell.

## Frameless window

The window has no system default frame. The title bar is drawn by the app, 36px tall:

- **The whole bar is draggable**; double-click toggles maximize / restore
- The left side shows the 16px whale glyph and the app name **DeepSeek Harness**
- The right side carries the standard window controls: minimize, maximize, close

### Status dot

A 6px dot next to the app name tells you the local service state at a glance:

| Color | State |
| --- | --- |
| <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--ds-accent-teal);vertical-align:middle"></span> Teal | Local service running (steady state) |
| <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--ds-text-tertiary);vertical-align:middle"></span> Grey | Starting up / service not ready |
| <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--ds-error);vertical-align:middle"></span> Red | Service error |

The dot stays steady — it never blinks or pulses. Hovering it shows the tooltip "Local service running".

## Closing minimizes to the tray

Clicking the **close** button only minimizes to the tray; the app keeps running in the background. The tray shows a one-time bubble tip the first time you hide the window.

To actually quit, pick "**Exit**" from the tray menu.

## System tray

The app keeps a tray icon. Right-click it for the menu:

| Item | Action |
| --- | --- |
| Open main window | Show and focus the main window |
| Start on boot | Launch in the background after sign-in |
| About dsh-desktop | Show version info |
| Exit | Stop the local service and quit completely |

A single click on the tray icon shows the main window. "Exit" only asks for confirmation when background tasks are actually running — otherwise it quits quietly.

## Single instance

Only one instance runs at a time. Double-clicking the icon again does not open a second window — it just brings the existing one forward.

## Native notifications

Alerts use the standard Windows notification style, identical to any normal app — no custom popup styling.
