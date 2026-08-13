# Quick start

Three steps and you are up and running. The app starts the service and opens the main window for you — no manual steps.

## 1. Download the installer

Get the latest installer (`.exe`) from the **Releases** page of this project and run it.

::: tip Note
Packaged desktop apps have no code signature, so the first run may trigger the Windows SmartScreen prompt. Click "More info" then "Run anyway" — see the [FAQ](./faq).
:::

## 2. Launch the app

After installing, double-click the **DeepSeek Harness** icon on your desktop.

- No Node.js, pnpm or command-line tools required
- Works fine under paths containing Chinese characters
- The app keeps running in the tray; closing the window does not quit it

## 3. Set your API key

On first launch a setup dialog asks for your DeepSeek API key:

1. Open [platform.deepseek.com](https://platform.deepseek.com), sign up and log in
2. On the **API Keys** page click "Create" to get a key that looks like `sk-...`
3. Paste the key into the dialog, click save, and the main window opens

> Your key is stored only on your own machine. It is never uploaded anywhere. The app starts the local service and opens the main window for you — no manual steps after this.

## Requirements

- Windows 10 / 11 (64-bit)
- No Node.js, pnpm or any command-line tools needed
- Installable under paths with Chinese characters

## Next steps

- Learn how the [window and system tray](./tray) behave
- Running into trouble? Check the [FAQ](./faq)
