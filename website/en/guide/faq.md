# FAQ

## Antivirus warning or SmartScreen prompt?

Packaged desktop apps have no code signature. The first run may trigger the Windows SmartScreen "Windows protected your PC" message, and some antivirus tools may raise a false positive. This is normal for packaged software, not a sign of a problem.

**SmartScreen prompt**

Click "**More info**" then "**Run anyway**".

**Windows Defender exclusion**

1. Open "Virus & threat protection"
2. Go to "Exclusions" → "Add or remove exclusions"
3. "Add an exclusion" → choose the install folder or the program file

**360 Total Security**

Trojan scan → Trust zone → Add a trusted directory, then select the install folder.

**Huorong Security**

Protection center → Virus protection → Trust zone → Add file/directory, then select the install folder.

**Tencent PC Manager**

Virus scan → Trust zone, then add the install folder.

## Can I install it in a path with Chinese characters?

Yes. The desktop app does not rely on command-line scripts, so it works fine under paths with Chinese characters (for example `软件\DeepSeek Harness`).

## Port already in use?

No worries. The service listens on a system-assigned port (**port 0**), so Windows picks a free one at startup. It never conflicts with port 3080 or any other program, and no manual configuration is needed.

## Why is the app still running after I close the window?

Closing the window minimizes to the **tray** by default — the app keeps running in the background by design, so the service stays online and can be summoned at any time. Pick "**Exit**" from the tray menu to fully quit.

## Where is my API key stored?

Your DeepSeek API key is stored **only on this machine**:

- The key is saved locally through the onboarding dialog
- It is never uploaded anywhere or sent to any server
- Data lives in `%USERPROFILE%\.dsh`

Switching machines or want to reconfigure? Uninstall, reinstall and run the onboarding again.

## Do I have to pay?

The software itself is **free and open source**, but calling the DeepSeek API is billed by the official **pay-as-you-go** pricing.

Current reference prices (per million tokens): deepseek-v4-flash $0.14 input / $0.28 output; deepseek-v4-pro $0.435 input / $0.87 output; cache-hit input is far cheaper.

See the [official pricing page](https://api-docs.deepseek.com/quick_start/pricing) for the authoritative list. Billing switches to peak/off-peak pricing starting 2026-08-16.

## Still stuck?

Check the [DeepSeek Harness official docs](https://github.com/deepseek-ai/deepseek-harness) first. This is a community project — when in doubt, the official documentation is the source of truth.
