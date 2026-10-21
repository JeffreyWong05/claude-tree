import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * "Start automatically when I log in".
 * Windows: a shortcut in the Startup folder that runs "Start Claude Tree.bat --no-browser" minimized.
 * Mac: a LaunchAgent that runs the launcher at login (untested on real hardware).
 */

const ROOT = process.cwd();

function windowsShortcut(): string {
  return path.join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Claude Tree.lnk");
}

function macAgent(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", "com.claudetree.launcher.plist");
}

export function autostartSupported(): boolean {
  return process.platform === "win32" || process.platform === "darwin";
}

export function autostartEnabled(): boolean {
  if (process.platform === "win32") return fs.existsSync(windowsShortcut());
  if (process.platform === "darwin") return fs.existsSync(macAgent());
  return false;
}

/** PowerShell single-quoted string literal. */
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function setAutostart(enabled: boolean): void {
  if (process.platform === "win32") {
    const link = windowsShortcut();
    if (!enabled) return fs.rmSync(link, { force: true });
    const script = [
      `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${psQuote(link)})`,
      `$s.TargetPath = ${psQuote(path.join(ROOT, "Start Claude Tree.bat"))}`,
      `$s.Arguments = '--no-browser'`,
      `$s.WorkingDirectory = ${psQuote(ROOT)}`,
      `$s.WindowStyle = 7`, // minimized: no window pops up at login
      `$s.Description = 'Start Claude Tree in the background'`,
      `$s.Save()`,
    ].join("; ");
    const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
    if (result.status !== 0 || !fs.existsSync(link)) throw new Error(`Couldn't create the startup shortcut: ${result.stderr}`);
    return;
  }
  if (process.platform === "darwin") {
    const plist = macAgent();
    if (!enabled) return fs.rmSync(plist, { force: true });
    fs.mkdirSync(path.dirname(plist), { recursive: true });
    fs.writeFileSync(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.claudetree.launcher</string>
  <key>ProgramArguments</key><array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape(path.join(ROOT, "scripts", "launch.mjs"))}</string>
    <string>--no-browser</string>
  </array>
  <key>WorkingDirectory</key><string>${xmlEscape(ROOT)}</string>
  <key>RunAtLoad</key><true/>
</dict></plist>
`,
    );
    return;
  }
  throw new Error("Starting at login isn't supported on this system yet.");
}
