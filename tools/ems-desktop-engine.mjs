#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_SETTLE_MS = 8000;
const DEFAULT_MAX_EXTENSIONS = 6;
const DEFAULT_BASE_PORT = 9322;
const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_HTTP_TIMEOUT_MS = 1500;
const DEFAULT_POWERSHELL_TIMEOUT_MS = 10000;
const CACHE_SCHEMA_VERSION = 1;
const DISABLED_SUFFIX = ".DISABLED";
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const MEASUREMENT_MODE_AUTO = "auto";
const MEASUREMENT_MODE_HEADLESS = "headless";
const MEASUREMENT_MODE_OFFSCREEN = "offscreen";
const MEASUREMENT_MODE_VISIBLE = "visible";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function printHelp() {
  console.log(`EMS Desktop Engine\n\nUsage:\n  node tools/ems-desktop-engine.mjs list-browsers [--json]\n  node tools/ems-desktop-engine.mjs calibrate-auto --browser-id <id> [--jsonl] [--max-extensions 6] [--settle-ms 8000] [--measurement-mode auto|headless|offscreen|visible]\n`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--json") options.json = true;
    else if (token === "--jsonl") options.jsonl = true;
    else if (token === "--browser-id") options.browserId = rest[++i];
    else if (token === "--max-extensions") options.maxExtensions = Number(rest[++i]);
    else if (token === "--settle-ms") options.settleMs = Number(rest[++i]);
    else if (token === "--base-port") options.basePort = Number(rest[++i]);
    else if (token === "--out") options.out = rest[++i];
    else if (token === "--measurement-mode") options.measurementMode = rest[++i];
    else if (token === "--cache-ttl-ms") options.cacheTtlMs = Number(rest[++i]);
    else if (token === "--no-cache") options.noCache = true;
  }
  return { command, options };
}

function emitJsonLine(options, payload) {
  if (options.jsonl) console.log(JSON.stringify(payload));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stableId(parts) {
  return createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 12);
}

async function httpJson(url, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Timed out after ${timeoutMs}ms for ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function runPowerShellJson(command, timeoutMs = DEFAULT_POWERSHELL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", command], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };
    const timeout = setTimeout(() => {
      child.kill();
      settle(reject, new Error(`PowerShell timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => settle(reject, error));
    child.on("close", (code) => {
      if (code !== 0) {
        settle(reject, new Error(stderr.trim() || `PowerShell failed with exit code ${code}`));
        return;
      }
      try {
        settle(resolve, JSON.parse(stdout || "[]"));
      } catch (error) {
        settle(reject, new Error(`Failed to parse PowerShell JSON: ${error.message}\n${stdout}`));
      }
    });
  });
}

async function getWindowsChromeProcesses() {
  const psCommand = [
    "$ErrorActionPreference = 'Stop';",
    "$procInfo = Get-CimInstance Win32_Process -Filter \"name = 'chrome.exe'\" | Select-Object ProcessId, ParentProcessId, CommandLine, ExecutablePath;",
    "$rows = foreach ($proc in $procInfo) {",
    "  [pscustomobject]@{",
    "    processId = $proc.ProcessId;",
    "    parentProcessId = $proc.ParentProcessId;",
    "    executablePath = $proc.ExecutablePath;",
    "    commandLine = $proc.CommandLine",
    "  }",
    "};",
    "$rows | ConvertTo-Json -Depth 5 -Compress"
  ].join(" ");

  const rows = await runPowerShellJson(psCommand);
  return Array.isArray(rows) ? rows : rows ? [rows] : [];
}
async function getForegroundWindowInfo() {
  const psCommand = [
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "using System.Text;",
    "public static class Win32Foreground {",
    "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "  [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);",
    "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
    "}",
    "'@;",
    "$handle = [Win32Foreground]::GetForegroundWindow();",
    "$builder = New-Object System.Text.StringBuilder 1024;",
    "[void][Win32Foreground]::GetWindowText($handle, $builder, $builder.Capacity);",
    "$processId = 0;",
    "[void][Win32Foreground]::GetWindowThreadProcessId($handle, [ref]$processId);",
    "[pscustomobject]@{ processId = [int]$processId; title = $builder.ToString() } | ConvertTo-Json -Compress"
  ].join(" ");

  try {
    return await runPowerShellJson(psCommand);
  } catch {
    return null;
  }
}
function parseCommandLineArg(commandLine, name) {
  if (!commandLine) return null;
  const pattern = new RegExp(`--${name}(?:=|\\s+)(?:\"([^\"]+)\"|([^\\s\"]+))`, "i");
  const match = commandLine.match(pattern);
  return match?.[1] ?? match?.[2] ?? null;
}

function parseRemoteDebuggingPort(commandLine) {
  const raw = parseCommandLineArg(commandLine, "remote-debugging-port");
  const port = Number(raw);
  return Number.isFinite(port) ? port : null;
}

function isBrowserProcess(row) {
  const commandLine = row.commandLine ?? "";
  return commandLine.toLowerCase().includes("chrome.exe") && !commandLine.includes("--type=");
}

async function tryReadJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveProfileDirectory(commandLine) {
  return parseCommandLineArg(commandLine, "profile-directory") ?? "Default";
}

async function readProfileDisplayName(userDataDir, profileDirectory) {
  const localState = await tryReadJson(path.join(userDataDir, "Local State"));
  const cached = localState?.profile?.info_cache?.[profileDirectory];
  return cached?.name ?? cached?.gaia_name ?? profileDirectory;
}

function normalizeTitle(value) {
  return String(value ?? "")
    .replace(/ - Google Chrome$/i, "")
    .replace(/ - Chrome$/i, "")
    .trim()
    .toLowerCase();
}

function chooseActiveTarget(targets, foregroundInfo) {
  const pages = targets.filter((target) => target.type === "page" && /^https?:\/\//.test(target.url ?? ""));
  if (!pages.length) return null;

  const foregroundTitle = normalizeTitle(foregroundInfo?.title);
  if (foregroundTitle) {
    const exact = pages.find((target) => normalizeTitle(target.title) === foregroundTitle);
    if (exact) return { ...exact, activeDetection: "foreground-title-exact" };
    const partial = pages.find((target) => {
      const title = normalizeTitle(target.title);
      return title && (foregroundTitle.includes(title) || title.includes(foregroundTitle));
    });
    if (partial) return { ...partial, activeDetection: "foreground-title-partial" };
  }

  return { ...pages[0], activeDetection: "first-http-target" };
}

async function listBrowsers() {
  const warnings = [];
  let processes = [];
  let foregroundInfo = null;
  try {
    [processes, foregroundInfo] = await Promise.all([getWindowsChromeProcesses(), getForegroundWindowInfo()]);
  } catch (error) {
    warnings.push(`Could not inspect chrome.exe command lines: ${error.message}`);
  }

  const browsers = [];
  const seenPorts = new Set();
  for (const row of processes.filter(isBrowserProcess)) {
    const port = parseRemoteDebuggingPort(row.commandLine);
    if (!port || seenPorts.has(port)) continue;
    seenPorts.add(port);

    const userDataDir = parseCommandLineArg(row.commandLine, "user-data-dir");
    const profileDirectory = resolveProfileDirectory(row.commandLine);
    const profileDir = userDataDir ? path.join(userDataDir, profileDirectory) : null;
    const profileName = userDataDir ? await readProfileDisplayName(userDataDir, profileDirectory) : "unknown profile";

    let version = null;
    let targets = [];
    let activeTarget = null;
    let reachable = false;
    let warning = null;
    try {
      version = await httpJson(`http://${DEFAULT_HOST}:${port}/json/version`);
      targets = await httpJson(`http://${DEFAULT_HOST}:${port}/json/list`);
      activeTarget = chooseActiveTarget(targets, foregroundInfo);
      reachable = true;
    } catch (error) {
      warning = error.message;
    }

    browsers.push({
      id: stableId([row.executablePath, String(port), userDataDir, profileDirectory]),
      processId: row.processId,
      executablePath: row.executablePath,
      host: DEFAULT_HOST,
      port,
      userDataDir,
      profileDirectory,
      profileDir,
      profileName,
      displayName: `${profileName} (${profileDirectory}) :${port}`,
      browser: version?.Browser ?? null,
      reachable,
      activeUrl: activeTarget?.url ?? null,
      activeTitle: activeTarget?.title ?? null,
      activeDetection: activeTarget?.activeDetection ?? null,
      pageTargets: targets.filter((target) => target.type === "page").map((target) => ({ title: target.title, url: target.url })),
      warning
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    foreground: foregroundInfo,
    browsers,
    warnings,
    notes: [
      "Only Chromium instances launched with --remote-debugging-port can be measured.",
      "A/B calibration clones the selected profile into .tmp/desktop-runs before changing extension files."
    ]
  };
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function looksLikeHostPattern(value) {
  return value === "<all_urls>" || /^[a-z*]+:\/\//.test(value);
}

function collectContentScriptMatches(manifest) {
  if (!Array.isArray(manifest.content_scripts)) return [];
  return uniqueStrings(manifest.content_scripts.flatMap((script) => asStringArray(script?.matches)));
}

function collectManifestHostPermissions(manifest) {
  const hostPermissions = asStringArray(manifest.host_permissions);
  const permissionOrigins = asStringArray(manifest.permissions).filter(looksLikeHostPattern);
  return uniqueStrings([...hostPermissions, ...permissionOrigins]);
}

function collectOptionalHostPermissions(manifest) {
  const optionalHostPermissions = asStringArray(manifest.optional_host_permissions);
  const optionalPermissionOrigins = asStringArray(manifest.optional_permissions).filter(looksLikeHostPattern);
  return uniqueStrings([...optionalHostPermissions, ...optionalPermissionOrigins]);
}

async function readDefaultLocaleMessages(basePath, manifest) {
  if (!manifest.default_locale) return null;
  return tryReadJson(path.join(basePath, "_locales", manifest.default_locale, "messages.json"));
}

function resolveManifestMessage(value, messages) {
  if (typeof value !== "string") return value;
  if (!value.startsWith("__MSG_") || !value.endsWith("__")) return value;
  const messageKey = value.slice("__MSG_".length, -2);
  return messages?.[messageKey]?.message ?? value;
}

async function collectInstalledExtensions(profileDir) {
  const extensionsDir = path.join(profileDir, "Extensions");
  let extensionDirs = [];
  try {
    extensionDirs = await fs.readdir(extensionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const extensions = [];
  for (const entry of extensionDirs) {
    if (!entry.isDirectory()) continue;
    const extensionId = entry.name.endsWith(DISABLED_SUFFIX) ? entry.name.slice(0, -DISABLED_SUFFIX.length) : entry.name;
    if (!EXTENSION_ID_PATTERN.test(extensionId)) continue;

    const extensionPath = path.join(extensionsDir, entry.name);
    let versionDirs = [];
    try {
      versionDirs = (await fs.readdir(extensionPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch {
      continue;
    }

    for (const version of versionDirs) {
      const basePath = path.join(extensionPath, version);
      const manifest = await tryReadJson(path.join(basePath, "manifest.json"));
      if (!manifest) continue;
      const localeMessages = await readDefaultLocaleMessages(basePath, manifest);
      extensions.push({
        extensionId,
        name: resolveManifestMessage(manifest.name, localeMessages) ?? extensionId,
        description: resolveManifestMessage(manifest.description, localeMessages) ?? "",
        version,
        disabled: entry.name.endsWith(DISABLED_SUFFIX),
        manifestSignals: {
          hostPermissions: collectManifestHostPermissions(manifest),
          optionalHostPermissions: collectOptionalHostPermissions(manifest),
          contentScriptMatches: collectContentScriptMatches(manifest)
        }
      });
      break;
    }
  }
  return extensions;
}

function patternMatchesUrl(pattern, urlString) {
  if (!pattern || !urlString) return false;
  if (pattern === "<all_urls>") return /^https?:\/\//.test(urlString);
  let regexText = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  regexText = `^${regexText}$`;
  try {
    return new RegExp(regexText).test(urlString);
  } catch {
    return false;
  }
}

function extensionMatchesTargetUrl(extension, targetUrl) {
  const signals = extension.manifestSignals ?? {};
  const patterns = [
    ...(signals.hostPermissions ?? []),
    ...(signals.optionalHostPermissions ?? []),
    ...(signals.contentScriptMatches ?? [])
  ];
  return patterns.some((pattern) => patternMatchesUrl(pattern, targetUrl));
}

async function copyPathIfExists(from, to) {
  if (!(await pathExists(from))) return;
  await fs.cp(from, to, { recursive: true, force: true, errorOnExist: false });
}

async function cloneUserDataForProbe(sourceUserDataDir, sourceProfileDirectory, targetUserDataDir) {
  await fs.rm(targetUserDataDir, { recursive: true, force: true });
  await fs.mkdir(targetUserDataDir, { recursive: true });
  await copyPathIfExists(path.join(sourceUserDataDir, "Local State"), path.join(targetUserDataDir, "Local State"));
  await copyPathIfExists(path.join(sourceUserDataDir, "First Run"), path.join(targetUserDataDir, "First Run"));

  const sourceProfileDir = path.join(sourceUserDataDir, sourceProfileDirectory);
  const targetProfileDir = path.join(targetUserDataDir, sourceProfileDirectory);
  await fs.mkdir(targetProfileDir, { recursive: true });
  const profileItems = [
    "Extensions",
    "Extension Rules",
    "Extension Scripts",
    "Extension State",
    "Local Extension Settings",
    "Managed Extension Settings",
    "Preferences",
    "Secure Preferences",
    "Sync Extension Settings"
  ];
  for (const item of profileItems) {
    await copyPathIfExists(path.join(sourceProfileDir, item), path.join(targetProfileDir, item));
  }
  return targetProfileDir;
}

async function disableExtensionInClone(profileDir, extensionId) {
  const extensionsDir = path.join(profileDir, "Extensions");
  const enabledPath = path.join(extensionsDir, extensionId);
  const disabledPath = path.join(extensionsDir, `${extensionId}${DISABLED_SUFFIX}`);
  if (!(await pathExists(enabledPath))) throw new Error(`Extension folder not found in clone: ${enabledPath}`);
  await fs.rm(disabledPath, { recursive: true, force: true });
  await fs.rename(enabledPath, disabledPath);
}

function spawnChrome({ chromePath, userDataDir, profileDirectory, port, url, measurementMode }) {
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check"
  ];

  if (measurementMode === MEASUREMENT_MODE_HEADLESS) {
    args.push("--headless=new", "--disable-gpu", "--mute-audio", "--window-size=1365,900");
  } else if (measurementMode === MEASUREMENT_MODE_OFFSCREEN) {
    args.push("--window-position=-32000,-32000", "--window-size=1365,900", "--mute-audio", "--disable-features=CalculateNativeWinOcclusion");
  }

  args.push(url);
  return spawn(chromePath, args, { windowsHide: measurementMode !== MEASUREMENT_MODE_VISIBLE, detached: false });
}

function killProcessTree(processId) {
  return new Promise((resolve) => {
    const child = spawn("taskkill", ["/PID", String(processId), "/T", "/F"], { windowsHide: true });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `node ${args.join(" ")} failed with exit code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function waitForDebugPort(port, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < Math.max(timeoutMs, 5000)) {
    try {
      await httpJson(`http://${DEFAULT_HOST}:${port}/json/version`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw new Error(`Chrome DevTools endpoint did not become reachable on port ${port}: ${lastError?.message ?? "timeout"}`);
}

async function captureSnapshotForClone({ root, chromePath, userDataDir, profileDirectory, profileDir, port, url, out, settleMs, measurementMode }) {
  const chrome = spawnChrome({ chromePath, userDataDir, profileDirectory, port, url, measurementMode });
  try {
    await waitForDebugPort(port, settleMs);
    await sleep(settleMs);
    await runNode([path.join(root, "tools", "ems-measure.mjs"), "snapshot", "--port", String(port), "--profile-dir", profileDir, "--out", out], root);
    const snapshot = JSON.parse(await fs.readFile(out, "utf8"));
    snapshot.emsMeasurementMode = measurementMode;
    return snapshot;
  } finally {
    if (chrome.pid) await killProcessTree(chrome.pid);
  }
}

function aggregateSnapshot(snapshot) {
  const processRows = snapshot.chromeProcesses ?? [];
  const rendererRows = processRows.filter((row) => row.guessedType === "renderer");
  const extensionRendererRows = processRows.filter((row) => row.guessedType === "renderer" && (row.commandLine ?? "").includes("--extension-process"));
  const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  return {
    totalPrivate: sum(processRows, "privateBytes"),
    totalWorkingSet: sum(processRows, "workingSet"),
    rendererPrivate: sum(rendererRows, "privateBytes"),
    rendererWorkingSet: sum(rendererRows, "workingSet"),
    extensionRendererPrivate: sum(extensionRendererRows, "privateBytes"),
    extensionTargetCount: (snapshot.extensionTargets ?? []).length,
    processCount: processRows.length
  };
}

function summarizeMeasuredDelta(before, after, extension) {
  const beforeAggregate = aggregateSnapshot(before);
  const afterAggregate = aggregateSnapshot(after);
  const totalPrivateDropBytes = beforeAggregate.totalPrivate - afterAggregate.totalPrivate;
  const rendererPrivateDropBytes = beforeAggregate.rendererPrivate - afterAggregate.rendererPrivate;
  const extensionRendererPrivateDropBytes = beforeAggregate.extensionRendererPrivate - afterAggregate.extensionRendererPrivate;
  const estimatedPrivateDropBytes = Math.max(totalPrivateDropBytes, rendererPrivateDropBytes, extensionRendererPrivateDropBytes, 0);
  const beforeRows = new Map((before.extensionSummaries ?? []).map((row) => [row.extensionId, row]));
  const afterRows = new Map((after.extensionSummaries ?? []).map((row) => [row.extensionId, row]));
  const changedTargets = [...new Set([...beforeRows.keys(), ...afterRows.keys()])]
    .map((extensionId) => ({
      extensionId,
      beforeTargets: beforeRows.get(extensionId)?.targetCount ?? 0,
      afterTargets: afterRows.get(extensionId)?.targetCount ?? 0
    }))
    .filter((row) => row.beforeTargets !== row.afterTargets);
  const targetChange = changedTargets.find((row) => row.extensionId === extension.extensionId);
  const contamination = changedTargets.filter((row) => row.extensionId !== extension.extensionId);
  return {
    extensionId: extension.extensionId,
    name: extension.name,
    version: extension.version,
    estimatedPrivateDropBytes,
    totalPrivateDropBytes,
    rendererPrivateDropBytes,
    extensionRendererPrivateDropBytes,
    beforeTargets: targetChange?.beforeTargets ?? beforeRows.get(extension.extensionId)?.targetCount ?? 0,
    afterTargets: targetChange?.afterTargets ?? afterRows.get(extension.extensionId)?.targetCount ?? 0,
    confidence: contamination.length ? "low" : "medium",
    contamination,
    notes: contamination.length
      ? "Other extension target counts changed during this A/B run, so treat this as a rough estimate."
      : "No unrelated extension target-count contamination was observed."
  };
}

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return "n/a";
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function normalizeCacheUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = "";
    return url.toString();
  } catch {
    return String(urlString ?? "");
  }
}

function cacheFilePath(root) {
  return path.join(root, ".tmp", "desktop-cache", "measurements.json");
}

function measurementCacheKey(browser, extension) {
  return stableId([
    browser.executablePath,
    browser.userDataDir,
    browser.profileDirectory,
    normalizeCacheUrl(browser.activeUrl),
    extension.extensionId,
    extension.version
  ]);
}

async function loadMeasurementCache(root) {
  const filePath = cacheFilePath(root);
  const parsed = await tryReadJson(filePath);
  if (parsed?.schemaVersion === CACHE_SCHEMA_VERSION && parsed.entries && typeof parsed.entries === "object") {
    return parsed;
  }
  return { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} };
}

async function saveMeasurementCache(root, cache) {
  const filePath = cacheFilePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function cachedResultsForCandidates(cache, browser, candidates, cacheTtlMs) {
  const now = Date.now();
  return candidates.flatMap((extension) => {
    const entry = cache.entries[measurementCacheKey(browser, extension)];
    if (!entry?.result || !entry.generatedAt) return [];
    const ageMs = now - Date.parse(entry.generatedAt);
    if (!Number.isFinite(ageMs) || ageMs > cacheTtlMs) return [];
    return [{
      ...entry.result,
      cacheStatus: "cached",
      notes: `Cached ${entry.generatedAt}. Background refresh is running. ${entry.result.notes ?? ""}`.trim()
    }];
  });
}

async function writeResultsToCache(root, cache, browser, results) {
  for (const result of results) {
    cache.entries[measurementCacheKey(browser, result)] = {
      generatedAt: result.generatedAt,
      targetUrl: normalizeCacheUrl(browser.activeUrl),
      result
    };
  }
  await saveMeasurementCache(root, cache);
}

function resolveRequestedMeasurementModes(options) {
  const requested = options.measurementMode ?? MEASUREMENT_MODE_AUTO;
  if (requested === MEASUREMENT_MODE_AUTO) return [MEASUREMENT_MODE_HEADLESS, MEASUREMENT_MODE_OFFSCREEN];
  if ([MEASUREMENT_MODE_HEADLESS, MEASUREMENT_MODE_OFFSCREEN, MEASUREMENT_MODE_VISIBLE].includes(requested)) return [requested];
  throw new Error(`Unknown measurement mode: ${requested}`);
}

async function captureBaselineForModes({ modes, capture }) {
  const errors = [];
  for (const mode of modes) {
    try {
      return await capture(mode);
    } catch (error) {
      errors.push(`${mode}: ${error.message}`);
    }
  }
  throw new Error(`All measurement modes failed. ${errors.join(" | ")}`);
}

function withMeasurementMetadata(result, { browser, measurementMode, cacheStatus, baselineSnapshotPath, afterSnapshotPath }) {
  return {
    ...result,
    estimatedPrivateDrop: formatBytes(result.estimatedPrivateDropBytes),
    targetUrl: browser.activeUrl,
    generatedAt: new Date().toISOString(),
    measurementMode,
    cacheStatus,
    baselineSnapshotPath,
    afterSnapshotPath
  };
}

async function calibrateAuto(options) {
  const root = repoRoot();
  const listing = await listBrowsers();
  const browser = listing.browsers.find((row) => row.id === options.browserId) ?? (listing.browsers.length === 1 ? listing.browsers[0] : null);
  if (!browser) throw new Error("No browser selected. Pass --browser-id from list-browsers.");
  if (!browser.reachable) throw new Error(`Selected browser is not reachable: ${browser.warning ?? "unknown error"}`);
  if (!browser.userDataDir || !browser.profileDirectory || !browser.profileDir) throw new Error("Selected browser does not expose enough profile path information for safe clone-based calibration.");
  if (!/^https?:\/\//.test(browser.activeUrl ?? "")) throw new Error("Selected browser active target is not a standard http(s) page.");

  const maxExtensions = Number.isFinite(options.maxExtensions) ? options.maxExtensions : DEFAULT_MAX_EXTENSIONS;
  const settleMs = Number.isFinite(options.settleMs) ? options.settleMs : DEFAULT_SETTLE_MS;
  const basePort = Number.isFinite(options.basePort) ? options.basePort : DEFAULT_BASE_PORT;
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : DEFAULT_CACHE_TTL_MS;
  const requestedModes = resolveRequestedMeasurementModes(options);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = path.join(root, ".tmp", "desktop-runs", runId);
  const baselineRoot = path.join(runRoot, "baseline");
  const baselineProfileDir = path.join(baselineRoot, browser.profileDirectory);
  const snapshotsDir = path.join(runRoot, "snapshots");
  await fs.mkdir(snapshotsDir, { recursive: true });

  emitJsonLine(options, { event: "start", browser, runRoot });
  await cloneUserDataForProbe(browser.userDataDir, browser.profileDirectory, baselineRoot);
  const installed = await collectInstalledExtensions(baselineProfileDir);
  const allCandidates = installed.filter((extension) => !extension.disabled && extensionMatchesTargetUrl(extension, browser.activeUrl));
  const candidates = allCandidates.slice(0, maxExtensions);
  emitJsonLine(options, { event: "candidates", count: candidates.length, totalMatchingBeforeLimit: allCandidates.length, maxExtensions, candidates, measurementModes: requestedModes });
  if (!candidates.length) throw new Error(`No enabled installed extensions declare access to ${browser.activeUrl}.`);

  const cache = options.noCache ? { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} } : await loadMeasurementCache(root);
  const cachedResults = options.noCache ? [] : cachedResultsForCandidates(cache, browser, candidates, cacheTtlMs);
  if (cachedResults.length) {
    emitJsonLine(options, { event: "cached-results", count: cachedResults.length, results: cachedResults });
  }

  const baselineByMode = new Map();
  async function getBaselineForMode(mode) {
    if (baselineByMode.has(mode)) return baselineByMode.get(mode);
    const snapshotPath = path.join(snapshotsDir, mode === requestedModes[0] ? "baseline.json" : `baseline-${mode}.json`);
    const snapshot = await captureSnapshotForClone({
      root,
      chromePath: browser.executablePath,
      userDataDir: baselineRoot,
      profileDirectory: browser.profileDirectory,
      profileDir: baselineProfileDir,
      port: basePort,
      url: browser.activeUrl,
      out: snapshotPath,
      settleMs,
      measurementMode: mode
    });
    const value = { snapshot, snapshotPath, mode };
    baselineByMode.set(mode, value);
    return value;
  }

  let activeBaseline = await captureBaselineForModes({
    modes: requestedModes,
    capture: async (mode) => {
      emitJsonLine(options, { event: "worker-mode", mode, phase: "baseline" });
      return getBaselineForMode(mode);
    }
  });

  const results = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    emitJsonLine(options, { event: "candidate", index: index + 1, total: candidates.length, extension: candidate, measurementMode: activeBaseline.mode });
    const afterRoot = path.join(runRoot, `without-${candidate.extensionId}`);
    await cloneUserDataForProbe(browser.userDataDir, browser.profileDirectory, afterRoot);
    const afterProfileDir = path.join(afterRoot, browser.profileDirectory);
    await disableExtensionInClone(afterProfileDir, candidate.extensionId);

    let afterSnapshotPath = path.join(snapshotsDir, `without-${candidate.extensionId}-${activeBaseline.mode}.json`);
    let after;
    try {
      after = await captureSnapshotForClone({ root, chromePath: browser.executablePath, userDataDir: afterRoot, profileDirectory: browser.profileDirectory, profileDir: afterProfileDir, port: basePort + index + 1, url: browser.activeUrl, out: afterSnapshotPath, settleMs, measurementMode: activeBaseline.mode });
    } catch (error) {
      const fallbackMode = requestedModes.find((mode) => mode !== activeBaseline.mode);
      if (!fallbackMode) throw error;
      emitJsonLine(options, { event: "fallback", from: activeBaseline.mode, to: fallbackMode, reason: error.message, extension: candidate });
      activeBaseline = await getBaselineForMode(fallbackMode);
      afterSnapshotPath = path.join(snapshotsDir, `without-${candidate.extensionId}-${activeBaseline.mode}.json`);
      after = await captureSnapshotForClone({ root, chromePath: browser.executablePath, userDataDir: afterRoot, profileDirectory: browser.profileDirectory, profileDir: afterProfileDir, port: basePort + index + 1, url: browser.activeUrl, out: afterSnapshotPath, settleMs, measurementMode: activeBaseline.mode });
    }

    const delta = summarizeMeasuredDelta(activeBaseline.snapshot, after, candidate);
    const result = withMeasurementMetadata(delta, { browser, measurementMode: activeBaseline.mode, cacheStatus: "measured", baselineSnapshotPath: activeBaseline.snapshotPath, afterSnapshotPath });
    results.push(result);
    if (!options.noCache) await writeResultsToCache(root, cache, browser, [result]);
    emitJsonLine(options, { event: "result", result });
  }

  const payload = { generatedAt: new Date().toISOString(), mode: "desktop-ab-measured-delta", browser, runRoot, settleMs, maxExtensions, measurementModes: requestedModes, cacheTtlMs, cachedResultCount: cachedResults.length, results };
  const out = options.out ?? path.join(runRoot, "desktop-calibration-results.json");
  await fs.writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  emitJsonLine(options, { event: "complete", outputPath: out, results });
  return payload;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }
  if (command === "list-browsers") {
    const payload = await listBrowsers();
    console.log(JSON.stringify(payload, null, options.json ? 2 : 0));
    return;
  }
  if (command === "calibrate-auto") {
    const payload = await calibrateAuto(options);
    if (!options.jsonl) console.log(JSON.stringify(payload, null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  if (process.argv.includes("--jsonl")) console.log(JSON.stringify({ event: "error", message: error.message }));
  else console.error(error.message);
  process.exitCode = 1;
});
