#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_PORT = 9222;
const DEFAULT_HOST = "127.0.0.1";
const EXTENSION_ID_PATTERN = /[a-p]{32}/g;
const DISABLED_SUFFIX = ".DISABLED";

function printHelp() {
  console.log(`EMS Chrome Memory Probe

Usage:
  node ems-measure.mjs snapshot [--host 127.0.0.1] [--port 9222] [--profile-dir "C:\\...\\Profile 4"] [--out snapshots\\ems-snapshot.json]
  node ems-measure.mjs live-estimates [--host 127.0.0.1] [--port 9222] [--profile-dir "C:\\...\\Profile 4"] [--target-url https://example.com] [--out test-results\\live-memory-estimates.json] [--apply-to-ems]
  node ems-measure.mjs profile-inventory --profile-dir "C:\\...\\Profile 4" [--out snapshots\\profile-inventory.json]
  node ems-measure.mjs diff <before.json> <after.json>
  node ems-measure.mjs export-labels <before.json> <after.json> [--source youtube-3ext-scenario] [--extension-id <id>] [--out docs\\generated-benchmark-labels.json]
  node ems-measure.mjs build-catalog <scenarios.json> [--out docs\\generated-benchmark-labels.json]
  node ems-measure.mjs discover-scenarios <before.json> <after-dir> [--after-prefix yt3-after-] [--source youtube-3ext-scenario] [--out docs\\youtube-benchmark-scenarios.json]

Commands:
  snapshot   Capture CDP targets plus Windows chrome.exe process memory.
  live-estimates  Export near-real-time per-extension memory estimates from the current Chrome process snapshot.
  profile-inventory  Read installed extension manifest metadata from a test/probe profile without launching Chrome.
  diff       Compare two snapshot files and summarize deltas.
  export-labels  Convert a validated A/B diff into popup import JSON.
  build-catalog  Build one popup import catalog from multiple diff scenarios.
  discover-scenarios  Discover build-catalog scenarios from one baseline and an after-snapshot folder.
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { host: DEFAULT_HOST, port: DEFAULT_PORT };
  const positionals = [];

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--host") {
      options.host = rest[++i];
    } else if (token === "--port") {
      options.port = Number(rest[++i]);
    } else if (token === "--out") {
      options.out = rest[++i];
    } else if (token === "--profile-dir") {
      options.profileDir = rest[++i];
    } else if (token === "--source") {
      options.source = rest[++i];
    } else if (token === "--extension-id") {
      options.extensionId = rest[++i];
    } else if (token === "--after-prefix") {
      options.afterPrefix = rest[++i];
    } else if (token === "--target-url") {
      options.targetUrl = rest[++i];
    } else if (token === "--ems-extension-id") {
      options.emsExtensionId = rest[++i];
    } else if (token === "--apply-to-ems") {
      options.applyToEms = true;
    } else {
      positionals.push(token);
    }
  }

  return { command, options, positionals };
}

async function httpJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function tryReadJson(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function collectContentScriptMatches(manifest) {
  if (!Array.isArray(manifest.content_scripts)) {
    return [];
  }

  return uniqueStrings(manifest.content_scripts.flatMap((script) => asStringArray(script?.matches)));
}

function looksLikeHostPattern(value) {
  return value === "<all_urls>" || /^[a-z*]+:\/\//.test(value);
}

function collectOptionalHostPermissions(manifest) {
  const optionalHostPermissions = asStringArray(manifest.optional_host_permissions);
  const optionalPermissionOrigins = asStringArray(manifest.optional_permissions).filter(looksLikeHostPattern);
  return uniqueStrings([...optionalHostPermissions, ...optionalPermissionOrigins]);
}

function collectManifestHostPermissions(manifest) {
  const hostPermissions = asStringArray(manifest.host_permissions);
  const permissionOrigins = asStringArray(manifest.permissions).filter(looksLikeHostPattern);
  return uniqueStrings([...hostPermissions, ...permissionOrigins]);
}

async function readDefaultLocaleMessages(basePath, manifest) {
  if (!manifest.default_locale) {
    return null;
  }
  return tryReadJson(path.join(basePath, "_locales", manifest.default_locale, "messages.json"));
}

function resolveManifestMessage(value, messages) {
  if (typeof value !== "string") {
    return value;
  }
  if (!value.startsWith("__MSG_") || !value.endsWith("__")) {
    return value;
  }

  const messageKey = value.slice("__MSG_".length, -2);
  return messages?.[messageKey]?.message ?? value;
}

async function collectInstalledExtensions(profileDir) {
  if (!profileDir) {
    return new Map();
  }

  const extensionsDir = path.join(profileDir, "Extensions");
  let extensionDirs;
  try {
    extensionDirs = await fs.readdir(extensionsDir, { withFileTypes: true });
  } catch {
    return new Map();
  }

  const metadata = new Map();

  for (const entry of extensionDirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    const normalizedId = entry.name.endsWith(DISABLED_SUFFIX)
      ? entry.name.slice(0, -DISABLED_SUFFIX.length)
      : entry.name;
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
      if (!manifest) {
        continue;
      }

      const localeMessages = await readDefaultLocaleMessages(basePath, manifest);
      const displayName = resolveManifestMessage(manifest.name, localeMessages) ?? normalizedId;
      const description = resolveManifestMessage(manifest.description, localeMessages) ?? "";

      const manifestHostPermissions = collectManifestHostPermissions(manifest);
      const optionalHostPermissions = collectOptionalHostPermissions(manifest);
      const contentScriptMatches = collectContentScriptMatches(manifest);

      metadata.set(normalizedId, {
        extensionId: normalizedId,
        name: displayName,
        version,
        manifestVersion: manifest.manifest_version ?? null,
        description,
        disabled: entry.name.endsWith(DISABLED_SUFFIX),
        manifestSignals: {
          hostPermissions: manifestHostPermissions,
          optionalHostPermissions,
          contentScriptMatches
        }
      });
      break;
    }
  }

  return metadata;
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);
      this.socket = socket;
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", (event) => reject(event.error ?? new Error("WebSocket error")));
      socket.addEventListener("message", (event) => this.#handleMessage(event.data));
      socket.addEventListener("close", () => {
        for (const { reject: rejectPromise } of this.pending.values()) {
          rejectPromise(new Error("CDP socket closed"));
        }
        this.pending.clear();
      });
    });
  }

  #handleMessage(raw) {
    const message = JSON.parse(raw);
    if (!Object.hasOwn(message, "id")) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? "CDP command failed"));
      return;
    }
    pending.resolve(message.result ?? {});
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    this.socket?.close();
  }
}

function runPowerShellJson(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-Command", command],
      { windowsHide: true }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell failed with exit code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "[]"));
      } catch (error) {
        reject(new Error(`Failed to parse PowerShell JSON: ${error.message}\n${stdout}`));
      }
    });
  });
}

async function getWindowsChromeProcesses() {
  const psCommand = [
    "$procInfo = Get-CimInstance Win32_Process -Filter \"name = 'chrome.exe'\" | Select-Object ProcessId, ParentProcessId, CommandLine, ExecutablePath;",
    "$memInfo = Get-Process -Name chrome -ErrorAction SilentlyContinue | Select-Object Id, WorkingSet64, PrivateMemorySize64, VirtualMemorySize64, StartTime;",
    "$joined = foreach ($proc in $procInfo) {",
    "  $mem = $memInfo | Where-Object { $_.Id -eq $proc.ProcessId } | Select-Object -First 1;",
    "  [pscustomobject]@{",
    "    processId = $proc.ProcessId;",
    "    parentProcessId = $proc.ParentProcessId;",
    "    executablePath = $proc.ExecutablePath;",
    "    commandLine = $proc.CommandLine;",
    "    workingSet = if ($mem) { [int64]$mem.WorkingSet64 } else { $null };",
    "    privateBytes = if ($mem) { [int64]$mem.PrivateMemorySize64 } else { $null };",
    "    virtualBytes = if ($mem) { [int64]$mem.VirtualMemorySize64 } else { $null };",
    "    startTime = if ($mem) { $mem.StartTime.ToString('o') } else { $null }",
    "  }",
    "};",
    "$joined | ConvertTo-Json -Depth 5 -Compress"
  ].join(" ");

  const rows = await runPowerShellJson(psCommand);
  return Array.isArray(rows) ? rows : [rows];
}

function extractExtensionIds(text) {
  if (!text) {
    return [];
  }
  return [...new Set(text.match(EXTENSION_ID_PATTERN) ?? [])];
}

function guessProcessType(commandLine) {
  if (!commandLine) {
    return "unknown";
  }
  const match = commandLine.match(/--type=([^\s"]+)/);
  if (match) {
    return match[1];
  }
  if (commandLine.includes("\\chrome.exe")) {
    return "browser";
  }
  return "unknown";
}

function normalizePathForCommandLine(value) {
  return String(value ?? "")
    .replaceAll("/", "\\")
    .replaceAll('"', "")
    .toLowerCase();
}

function filterChromeProcessesByProfileDir(processes, profileDir) {
  if (!profileDir) {
    return processes;
  }

  const normalizedProfileDir = normalizePathForCommandLine(path.resolve(profileDir));
  const roots = processes.filter((row) => normalizePathForCommandLine(row.commandLine).includes(normalizedProfileDir));
  if (!roots.length) {
    return processes;
  }

  const childrenByParent = new Map();
  for (const row of processes) {
    const parentId = Number(row.parentProcessId);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(row);
  }

  const included = new Map();
  const stack = [...roots];
  while (stack.length) {
    const row = stack.pop();
    const processId = Number(row.processId);
    if (included.has(processId)) {
      continue;
    }
    included.set(processId, row);
    stack.push(...(childrenByParent.get(processId) ?? []));
  }

  return [...included.values()];
}

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) {
    return "n/a";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function groupTargetsByExtension(targets) {
  const grouped = new Map();
  for (const target of targets) {
    const extensionIds = extractExtensionIds(`${target.url ?? ""} ${target.title ?? ""}`);
    for (const extensionId of extensionIds) {
      if (!grouped.has(extensionId)) {
        grouped.set(extensionId, []);
      }
      grouped.get(extensionId).push(target);
    }
  }
  return grouped;
}

function buildExtensionSummaries(extensionTargets, chromeProcesses, installedExtensions) {
  const targetsByExtension = groupTargetsByExtension(extensionTargets);
  const summaries = [];

  for (const [extensionId, targets] of targetsByExtension.entries()) {
    const ownedProcesses = chromeProcesses.filter((processInfo) => {
      const ids = extractExtensionIds(processInfo.commandLine);
      return ids.includes(extensionId);
    });
    const installed = installedExtensions.get(extensionId);

    summaries.push({
      extensionId,
      name: installed?.name ?? null,
      version: installed?.version ?? null,
      disabledInProfile: installed?.disabled ?? false,
      targetTypes: [...new Set(targets.map((target) => target.type).filter(Boolean))],
      targetCount: targets.length,
      titleSamples: [...new Set(targets.map((target) => target.title).filter(Boolean))].slice(0, 5),
      ownedProcessCount: ownedProcesses.length,
      ownedPrivateBytes: ownedProcesses.reduce((sum, row) => sum + (row.privateBytes ?? 0), 0),
      ownedWorkingSet: ownedProcesses.reduce((sum, row) => sum + (row.workingSet ?? 0), 0),
      ownedProcessIds: ownedProcesses.map((row) => row.processId),
      attribution: ownedProcesses.length > 0 ? "direct-process-match" : "target-only"
    });
  }

  return summaries.sort((a, b) => b.ownedPrivateBytes - a.ownedPrivateBytes);
}

function sumBytes(rows, field) {
  return rows.reduce((sum, row) => sum + (row[field] ?? 0), 0);
}

function aggregateSnapshot(snapshot) {
  const processRows = snapshot.chromeProcesses ?? [];
  const rendererRows = processRows.filter((row) => row.guessedType === "renderer");
  const extensionRendererRows = processRows.filter(
    (row) => row.guessedType === "renderer" && (row.commandLine ?? "").includes("--extension-process")
  );

  return {
    processCount: processRows.length,
    extensionTargetCount: (snapshot.extensionTargets ?? []).length,
    totalPrivate: sumBytes(processRows, "privateBytes"),
    totalWorkingSet: sumBytes(processRows, "workingSet"),
    rendererPrivate: sumBytes(rendererRows, "privateBytes"),
    rendererWorkingSet: sumBytes(rendererRows, "workingSet"),
    rendererCount: rendererRows.length,
    extensionRendererPrivate: sumBytes(extensionRendererRows, "privateBytes"),
    extensionRendererWorkingSet: sumBytes(extensionRendererRows, "workingSet"),
    extensionRendererCount: extensionRendererRows.length
  };
}

function formatSignedBytes(bytes) {
  const sign = bytes > 0 ? "+" : "";
  return `${sign}${formatBytes(bytes)}`;
}

function formatCompactBytes(bytes) {
  if (bytes <= 0) {
    return "0 B";
  }
  return formatBytes(bytes);
}

async function exportProfileInventory({ out, profileDir }) {
  if (!profileDir) {
    throw new Error("profile-inventory requires --profile-dir <path>.");
  }

  const installedExtensions = await collectInstalledExtensions(profileDir);
  const inventory = {
    capturedAt: new Date().toISOString(),
    profileDir,
    installedExtensions: Object.fromEntries(installedExtensions),
    notes: [
      "This reads manifest metadata from a test/probe profile on disk.",
      "Use it to inspect optional_host_permissions and content_scripts.matches that chrome.management does not expose in the stable popup API.",
      "Do not run this against the default personal Chrome profile for EMS verification."
    ]
  };

  const outputPath = out ?? path.join(process.cwd(), "snapshots", `profile-inventory-${Date.now()}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(inventory, null, 2), "utf8");

  console.log(`Saved profile inventory: ${outputPath}`);
  console.log(`Extensions in profile: ${installedExtensions.size}`);
  for (const extension of installedExtensions.values()) {
    const signals = extension.manifestSignals ?? {};
    console.log(
      `- ${extension.name ?? extension.extensionId} (${extension.extensionId}) | hosts=${signals.hostPermissions?.length ?? 0} | optionalHosts=${signals.optionalHostPermissions?.length ?? 0} | contentScripts=${signals.contentScriptMatches?.length ?? 0}`
    );
  }
}

async function captureSnapshotData({ host, port, profileDir }) {
  const baseHttpUrl = `http://${host}:${port}`;
  const version = await httpJson(`${baseHttpUrl}/json/version`);
  const list = await httpJson(`${baseHttpUrl}/json/list`);
  const installedExtensions = await collectInstalledExtensions(profileDir);

  const cdp = new CdpConnection(version.webSocketDebuggerUrl);
  await cdp.connect();

  let browserVersion = null;
  let systemProcessInfo = [];
  let targetInfos = [];
  try {
    browserVersion = await cdp.send("Browser.getVersion");
    const processInfoResult = await cdp.send("SystemInfo.getProcessInfo");
    systemProcessInfo = processInfoResult.processInfo ?? [];
    const targetsResult = await cdp.send("Target.getTargets");
    targetInfos = targetsResult.targetInfos ?? [];
  } finally {
    cdp.close();
  }

  const chromeProcesses = filterChromeProcessesByProfileDir(await getWindowsChromeProcesses(), profileDir);
  const enrichedProcesses = chromeProcesses.map((row) => ({
    ...row,
    guessedType: guessProcessType(row.commandLine),
    extensionIds: extractExtensionIds(row.commandLine)
  }));

  const extensionTargets = targetInfos
    .filter((target) => (target.url ?? "").startsWith("chrome-extension://"))
    .map((target) => ({
      targetId: target.targetId,
      type: target.type,
      title: target.title,
      url: target.url,
      attached: target.attached
    }));

  return {
    capturedAt: new Date().toISOString(),
    host,
    port,
    profileDir: profileDir ?? null,
    version,
    browserVersion,
    listTargets: list,
    targetInfos,
    extensionTargets,
    systemProcessInfo,
    chromeProcesses: enrichedProcesses,
    installedExtensions: Object.fromEntries(installedExtensions),
    extensionSummaries: buildExtensionSummaries(extensionTargets, enrichedProcesses, installedExtensions),
    attributionNotes: [
      "ownedPrivateBytes is a hard measurement only when a chrome.exe command line exposes the extension id.",
      "content-script memory inside renderer processes is not directly attributable from public stable APIs.",
      "Use A/B diff snapshots with the same tab set to estimate renderer-side extension impact."
    ]
  };
}

async function writeJsonFile(outputPath, payload) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
}

async function collectSnapshot({ host, port, out, profileDir }) {
  const snapshot = await captureSnapshotData({ host, port, profileDir });
  const outputPath = out ?? path.join(process.cwd(), "snapshots", `ems-snapshot-${Date.now()}.json`);
  await writeJsonFile(outputPath, snapshot);

  console.log(`Saved snapshot: ${outputPath}`);
  printSnapshotSummary(snapshot);
  return snapshot;
}

function printSnapshotSummary(snapshot) {
  console.log(`Browser: ${snapshot.version.Browser}`);
  console.log(`Extension targets: ${snapshot.extensionTargets.length}`);
  console.log(`Chrome processes: ${snapshot.chromeProcesses.length}`);
  console.log("Top extension summaries:");
  for (const summary of snapshot.extensionSummaries.slice(0, 10)) {
    console.log(
      `- ${summary.name ?? summary.extensionId} (${summary.extensionId}) | private=${formatBytes(summary.ownedPrivateBytes)} | ws=${formatBytes(summary.ownedWorkingSet)} | targets=${summary.targetCount} | attribution=${summary.attribution}`
    );
  }
}

function inferSnapshotTargetUrl(snapshot, explicitTargetUrl) {
  if (explicitTargetUrl) {
    return explicitTargetUrl;
  }
  const pageTarget = (snapshot.listTargets ?? []).find((target) => /^https?:\/\//.test(target?.url ?? ""));
  return pageTarget?.url ?? "";
}

function patternMatchesUrl(pattern, urlString) {
  if (!pattern || !urlString) {
    return false;
  }
  if (pattern === "<all_urls>") {
    return /^https?:\/\//.test(urlString);
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  const match = pattern.match(/^(\*|http|https|file|ftp):\/\/([^/]+)(\/.*)$/);
  if (!match) {
    return false;
  }

  const [, schemePattern, hostPattern] = match;
  if (schemePattern === "*") {
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
  } else if (url.protocol !== `${schemePattern}:`) {
    return false;
  }

  if (hostPattern === "*") {
    return true;
  }
  if (hostPattern.startsWith("*.")) {
    const suffix = hostPattern.slice(2);
    return url.hostname === suffix || url.hostname.endsWith(`.${suffix}`);
  }
  return url.hostname === hostPattern;
}

function installedExtensionMatchesTargetUrl(extension, targetUrl) {
  if (!targetUrl || extension?.disabled) {
    return false;
  }
  const signals = extension.manifestSignals ?? {};
  const patterns = [
    ...(signals.hostPermissions ?? []),
    ...(signals.optionalHostPermissions ?? []),
    ...(signals.contentScriptMatches ?? [])
  ];
  return patterns.some((pattern) => patternMatchesUrl(pattern, targetUrl));
}

function addInstalledHeuristicEstimates(payload, snapshot, aggregate, targetUrl) {
  if (!targetUrl || aggregate.extensionRendererPrivate <= 0) {
    return;
  }

  const installedEntries = Object.entries(snapshot.installedExtensions ?? {});
  const candidates = installedEntries.filter(([extensionId, extension]) => (
    !payload.memoryEstimates[extensionId] && installedExtensionMatchesTargetUrl(extension, targetUrl)
  ));
  if (!candidates.length) {
    return;
  }

  const denominator = Math.max(aggregate.extensionTargetCount + candidates.length, 1);
  const privateBytes = Math.max(1, Math.round(aggregate.extensionRendererPrivate / denominator));
  const workingSetBytes = Math.max(1, Math.round(aggregate.extensionRendererWorkingSet / denominator));

  for (const [extensionId, extension] of candidates) {
    payload.memoryEstimates[extensionId] = {
      privateBytes,
      workingSetBytes,
      attribution: "profile-installed-site-heuristic",
      confidence: "low",
      processCount: 0,
      targetCount: 0,
      notes: "No live extension target was observed. EMS assigned a low-confidence estimate because the installed manifest declares access to this site.",
      source: payload.source,
      capturedAt: snapshot.capturedAt,
      targetUrl,
      name: extension.name,
      version: extension.version
    };
  }
}

function buildLiveMemoryEstimatePayload(snapshot, options = {}) {
  const aggregate = aggregateSnapshot(snapshot);
  const targetUrl = inferSnapshotTargetUrl(snapshot, options.targetUrl);
  const payload = {
    capturedAt: snapshot.capturedAt,
    source: options.source ?? "live-process-snapshot",
    targetUrl,
    aggregate: {
      extensionRendererPrivate: aggregate.extensionRendererPrivate,
      extensionRendererWorkingSet: aggregate.extensionRendererWorkingSet,
      extensionTargetCount: aggregate.extensionTargetCount,
      processCount: aggregate.processCount
    },
    memoryEstimates: {},
    notes: [
      "High confidence means a Chrome process command line exposed the extension id and EMS summed that process memory.",
      "Low confidence means EMS apportioned shared extension renderer memory across observed extension targets.",
      "Content-script memory inside a normal page renderer is still not directly attributable from stable public APIs."
    ]
  };

  const sharedPrivateBytesPerTarget = aggregate.extensionTargetCount > 0
    ? aggregate.extensionRendererPrivate / aggregate.extensionTargetCount
    : 0;
  const sharedWorkingSetPerTarget = aggregate.extensionTargetCount > 0
    ? aggregate.extensionRendererWorkingSet / aggregate.extensionTargetCount
    : 0;

  for (const summary of snapshot.extensionSummaries) {
    if (!summary.extensionId) {
      continue;
    }

    let estimate = null;
    if (summary.ownedPrivateBytes > 0) {
      estimate = {
        privateBytes: summary.ownedPrivateBytes,
        workingSetBytes: summary.ownedWorkingSet,
        attribution: "direct-process-match",
        confidence: "high",
        processCount: summary.ownedProcessCount,
        processIds: summary.ownedProcessIds,
        targetCount: summary.targetCount,
        notes: "Direct extension-owned Chrome process memory. This does not include content-script memory mixed into page renderers."
      };
    } else if (summary.targetCount > 0 && sharedPrivateBytesPerTarget > 0) {
      estimate = {
        privateBytes: Math.round(sharedPrivateBytesPerTarget * summary.targetCount),
        workingSetBytes: Math.round(sharedWorkingSetPerTarget * summary.targetCount),
        attribution: "shared-extension-renderer-apportionment",
        confidence: "low",
        processCount: 0,
        targetCount: summary.targetCount,
        notes: "No extension-owned process id was exposed. EMS apportioned shared extension renderer memory across observed extension targets."
      };
    }

    if (!estimate?.privateBytes || estimate.privateBytes <= 0) {
      continue;
    }

    payload.memoryEstimates[summary.extensionId] = {
      ...estimate,
      source: payload.source,
      capturedAt: snapshot.capturedAt,
      targetUrl,
      name: summary.name,
      version: summary.version
    };
  }

  addInstalledHeuristicEstimates(payload, snapshot, aggregate, targetUrl);
  return payload;
}

function extractExtensionIdFromUrl(url) {
  const match = String(url ?? "").match(/^chrome-extension:\/\/([a-p]{32})\//);
  return match?.[1] ?? null;
}

async function findEmsServiceWorkerSession(cdp, emsExtensionId) {
  const targetsResult = await cdp.send("Target.getTargets");
  const candidates = (targetsResult.targetInfos ?? []).filter((target) => {
    const targetExtensionId = extractExtensionIdFromUrl(target.url);
    if (!targetExtensionId) {
      return false;
    }
    if (emsExtensionId && targetExtensionId !== emsExtensionId) {
      return false;
    }
    return target.type === "service_worker" || target.url.endsWith("/background.js");
  });

  for (const target of candidates) {
    const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    try {
      const manifestResult = await cdp.send(
        "Runtime.evaluate",
        { expression: "chrome.runtime.getManifest()", returnByValue: true },
        sessionId
      );
      const manifest = manifestResult.result?.value ?? {};
      if (manifest.name === "Extension Memory Saver" || manifest.short_name === "EMS" || manifest.name === "EMS MVP") {
        return { sessionId, extensionId: extractExtensionIdFromUrl(target.url) };
      }
    } catch {
      // Keep trying other extension service workers.
    }
  }

  return null;
}

async function applyLiveEstimatesToEms({ host, port, emsExtensionId }, payload) {
  const version = await httpJson(`http://${host}:${port}/json/version`);
  const cdp = new CdpConnection(version.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    const session = await findEmsServiceWorkerSession(cdp, emsExtensionId);
    if (!session) {
      throw new Error("Could not find the Extension Memory Saver service worker. Open or reload the EMS popup once, then rerun with --apply-to-ems.");
    }

    const expression = `(() => new Promise((resolve, reject) => {
      chrome.storage.local.set({ memoryEstimates: ${JSON.stringify(payload.memoryEstimates)} }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(true);
      });
    }))()`;

    await cdp.send("Runtime.evaluate", { expression, awaitPromise: true }, session.sessionId);
    return session.extensionId;
  } finally {
    cdp.close();
  }
}

async function exportLiveEstimates(options) {
  const snapshot = await captureSnapshotData(options);
  const payload = buildLiveMemoryEstimatePayload(snapshot, options);
  const outputPath = options.out ?? path.join(process.cwd(), "test-results", `live-memory-estimates-${Date.now()}.json`);
  await writeJsonFile(outputPath, payload);

  console.log(`Saved live memory estimates: ${outputPath}`);
  console.log(`Estimates exported: ${Object.keys(payload.memoryEstimates).length}`);
  for (const [extensionId, estimate] of Object.entries(payload.memoryEstimates).slice(0, 10)) {
    console.log(
      `- ${estimate.name ?? extensionId} (${extensionId}) | private=${formatBytes(estimate.privateBytes)} | confidence=${estimate.confidence} | attribution=${estimate.attribution}`
    );
  }

  if (options.applyToEms) {
    const emsExtensionId = await applyLiveEstimatesToEms(options, payload);
    console.log(`Applied estimates to EMS storage for extension ${emsExtensionId}. Reopen or refresh the EMS popup to render the latest values.`);
  }
}

function loadJson(filePath) {
  return fs.readFile(filePath, "utf8").then((text) => JSON.parse(text));
}

function summarizeDiff(before, after) {
  const beforeByExtension = new Map(before.extensionSummaries.map((row) => [row.extensionId, row]));
  const afterByExtension = new Map(after.extensionSummaries.map((row) => [row.extensionId, row]));
  const allIds = [...new Set([...beforeByExtension.keys(), ...afterByExtension.keys()])];
  const beforeAggregate = aggregateSnapshot(before);
  const afterAggregate = aggregateSnapshot(after);

  const extensionDiffs = allIds.map((extensionId) => {
    const beforeRow = beforeByExtension.get(extensionId);
    const afterRow = afterByExtension.get(extensionId);
    return {
      extensionId,
      name: afterRow?.name ?? beforeRow?.name ?? null,
      privateDelta: (afterRow?.ownedPrivateBytes ?? 0) - (beforeRow?.ownedPrivateBytes ?? 0),
      workingSetDelta: (afterRow?.ownedWorkingSet ?? 0) - (beforeRow?.ownedWorkingSet ?? 0),
      beforePrivate: beforeRow?.ownedPrivateBytes ?? 0,
      afterPrivate: afterRow?.ownedPrivateBytes ?? 0,
      beforeTargets: beforeRow?.targetCount ?? 0,
      afterTargets: afterRow?.targetCount ?? 0,
      targetDelta: (afterRow?.targetCount ?? 0) - (beforeRow?.targetCount ?? 0)
    };
  }).sort((a, b) => Math.abs(b.privateDelta) - Math.abs(a.privateDelta));

  return {
    beforeCapturedAt: before.capturedAt,
    afterCapturedAt: after.capturedAt,
    beforeAggregate,
    afterAggregate,
    sessionDelta: {
      totalPrivate: afterAggregate.totalPrivate - beforeAggregate.totalPrivate,
      totalWorkingSet: afterAggregate.totalWorkingSet - beforeAggregate.totalWorkingSet,
      rendererPrivate: afterAggregate.rendererPrivate - beforeAggregate.rendererPrivate,
      rendererWorkingSet: afterAggregate.rendererWorkingSet - beforeAggregate.rendererWorkingSet,
      extensionRendererPrivate: afterAggregate.extensionRendererPrivate - beforeAggregate.extensionRendererPrivate,
      extensionRendererWorkingSet: afterAggregate.extensionRendererWorkingSet - beforeAggregate.extensionRendererWorkingSet,
      processCount: afterAggregate.processCount - beforeAggregate.processCount,
      extensionTargetCount: afterAggregate.extensionTargetCount - beforeAggregate.extensionTargetCount,
      rendererCount: afterAggregate.rendererCount - beforeAggregate.rendererCount,
      extensionRendererCount: afterAggregate.extensionRendererCount - beforeAggregate.extensionRendererCount
    },
    removedExtensionTargets: extensionDiffs.filter((row) => row.beforeTargets > 0 && row.afterTargets === 0),
    addedExtensionTargets: extensionDiffs.filter((row) => row.beforeTargets === 0 && row.afterTargets > 0),
    extensionDiffs
  };
}

async function diffSnapshots(beforeFile, afterFile) {
  const [before, after] = await Promise.all([loadJson(beforeFile), loadJson(afterFile)]);
  const diff = summarizeDiff(before, after);
  console.log(`Before: ${beforeFile}`);
  console.log(`After:  ${afterFile}`);
  console.log(`Captured: ${diff.beforeCapturedAt} -> ${diff.afterCapturedAt}`);
  console.log("Session totals:");
  console.log(
    `- total private ${formatBytes(diff.beforeAggregate.totalPrivate)} -> ${formatBytes(diff.afterAggregate.totalPrivate)} (${formatSignedBytes(diff.sessionDelta.totalPrivate)})`
  );
  console.log(
    `- total working set ${formatBytes(diff.beforeAggregate.totalWorkingSet)} -> ${formatBytes(diff.afterAggregate.totalWorkingSet)} (${formatSignedBytes(diff.sessionDelta.totalWorkingSet)})`
  );
  console.log(
    `- renderer private ${formatBytes(diff.beforeAggregate.rendererPrivate)} -> ${formatBytes(diff.afterAggregate.rendererPrivate)} (${formatSignedBytes(diff.sessionDelta.rendererPrivate)})`
  );
  console.log(
    `- renderer working set ${formatBytes(diff.beforeAggregate.rendererWorkingSet)} -> ${formatBytes(diff.afterAggregate.rendererWorkingSet)} (${formatSignedBytes(diff.sessionDelta.rendererWorkingSet)})`
  );
  console.log(
    `- extension renderer private ${formatBytes(diff.beforeAggregate.extensionRendererPrivate)} -> ${formatBytes(diff.afterAggregate.extensionRendererPrivate)} (${formatSignedBytes(diff.sessionDelta.extensionRendererPrivate)})`
  );
  console.log(
    `- extension targets ${diff.beforeAggregate.extensionTargetCount} -> ${diff.afterAggregate.extensionTargetCount} (${diff.sessionDelta.extensionTargetCount > 0 ? "+" : ""}${diff.sessionDelta.extensionTargetCount})`
  );
  console.log(
    `- process count ${diff.beforeAggregate.processCount} -> ${diff.afterAggregate.processCount} (${diff.sessionDelta.processCount > 0 ? "+" : ""}${diff.sessionDelta.processCount})`
  );
  if (diff.removedExtensionTargets.length > 0) {
    console.log("Removed extension targets:");
    for (const row of diff.removedExtensionTargets.slice(0, 10)) {
      console.log(`- ${row.name ?? row.extensionId} (${row.extensionId})`);
    }
  }
  if (diff.addedExtensionTargets.length > 0) {
    console.log("Added extension targets:");
    for (const row of diff.addedExtensionTargets.slice(0, 10)) {
      console.log(`- ${row.name ?? row.extensionId} (${row.extensionId})`);
    }
  }
  console.log("Top extension deltas:");
  for (const row of diff.extensionDiffs.slice(0, 10)) {
    console.log(
      `- ${row.name ?? row.extensionId} (${row.extensionId}) | delta private=${formatSignedBytes(row.privateDelta)} | before=${formatBytes(row.beforePrivate)} | after=${formatBytes(row.afterPrivate)} | targets ${row.beforeTargets}->${row.afterTargets}`
    );
  }
}

function inferImpactLabel({ totalPrivateDrop, rendererPrivateDrop }) {
  const strongestDrop = Math.max(totalPrivateDrop, rendererPrivateDrop);
  const highThreshold = 60 * 1024 * 1024;
  const mediumThreshold = 25 * 1024 * 1024;
  const lowThreshold = 8 * 1024 * 1024;

  if (strongestDrop >= highThreshold) {
    return "high";
  }
  if (strongestDrop >= mediumThreshold) {
    return "medium";
  }
  if (strongestDrop >= lowThreshold) {
    return "low";
  }
  return "unknown";
}

function buildExportNote({ source, extensionName, metrics }) {
  const sourceLabel = source ?? "snapshot-diff-export";
  const safeName = String(extensionName).replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim();
  const targetText = metrics.targetDelta < 0 ? "removed target observed" : "target removal not observed";
  return `${sourceLabel}: ${safeName} scenario showed total private drop ${formatCompactBytes(metrics.totalPrivateDropBytes)} and renderer private drop ${formatCompactBytes(metrics.rendererPrivateDropBytes)}; ${targetText}.`;
}

function buildBenchmarkMetrics(diff, candidate) {
  return {
    attribution: "scenario-ab-delta",
    totalPrivateDropBytes: Math.max(0, -diff.sessionDelta.totalPrivate),
    totalWorkingSetDropBytes: Math.max(0, -diff.sessionDelta.totalWorkingSet),
    rendererPrivateDropBytes: Math.max(0, -diff.sessionDelta.rendererPrivate),
    rendererWorkingSetDropBytes: Math.max(0, -diff.sessionDelta.rendererWorkingSet),
    extensionRendererPrivateDropBytes: Math.max(0, -diff.sessionDelta.extensionRendererPrivate),
    extensionRendererWorkingSetDropBytes: Math.max(0, -diff.sessionDelta.extensionRendererWorkingSet),
    extensionOwnedPrivateDropBytes: Math.max(0, -candidate.privateDelta),
    extensionOwnedWorkingSetDropBytes: Math.max(0, -candidate.workingSetDelta),
    targetDelta: candidate.targetDelta,
    beforeTargets: candidate.beforeTargets,
    afterTargets: candidate.afterTargets
  };
}

function normalizeExportSource(source) {
  if (!source) {
    return "snapshot-diff-export";
  }
  return source;
}

function normalizeNameForMatch(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveBenchmarkCandidates(diff, options = {}) {
  const { extensionId, extensionName, extensionNameContains, strictSingleCandidate = false } = options;

  if (extensionId) {
    return diff.extensionDiffs.filter((row) => row.extensionId === extensionId);
  }

  if (extensionName) {
    const expectedName = normalizeNameForMatch(extensionName);
    return diff.extensionDiffs.filter((row) => normalizeNameForMatch(row.name) === expectedName);
  }

  if (extensionNameContains) {
    const expectedNamePart = normalizeNameForMatch(extensionNameContains);
    return diff.extensionDiffs.filter((row) => normalizeNameForMatch(row.name).includes(expectedNamePart));
  }

  const removedCandidates = diff.removedExtensionTargets;
  if (removedCandidates.length > 0) {
    if (strictSingleCandidate && removedCandidates.length !== 1) {
      throw new Error("This diff removed more than one extension target. Add extensionId, extensionName, or extensionNameContains to the scenario spec.");
    }
    return removedCandidates;
  }

  const negativeTargetCandidates = diff.extensionDiffs.filter((row) => row.targetDelta < 0);
  if (negativeTargetCandidates.length > 0) {
    if (strictSingleCandidate && negativeTargetCandidates.length !== 1) {
      throw new Error("This diff changed more than one target row. Add extensionId, extensionName, or extensionNameContains to the scenario spec.");
    }
    return negativeTargetCandidates;
  }

  return [];
}

function mergeCatalogPayloads(existingPayload, exportPayload) {
  return existingPayload && typeof existingPayload === "object"
    ? {
        ...existingPayload,
        generatedAt: exportPayload.generatedAt,
        source: exportPayload.source,
        thresholds: exportPayload.thresholds,
        extensions: {
          ...(existingPayload.extensions ?? {}),
          ...exportPayload.extensions
        }
      }
    : exportPayload;
}

function buildBenchmarkExport(diff, options = {}) {
  const {
    source,
    extensionId,
    extensionName,
    extensionNameContains,
    strictSingleCandidate = false
  } = options;
  const normalizedSource = normalizeExportSource(source);
  const totalPrivateDrop = Math.max(0, -diff.sessionDelta.totalPrivate);
  const rendererPrivateDrop = Math.max(0, -diff.sessionDelta.rendererPrivate);
  const impactLabel = inferImpactLabel({ totalPrivateDrop, rendererPrivateDrop });
  const candidates = resolveBenchmarkCandidates(diff, {
    extensionId,
    extensionName,
    extensionNameContains,
    strictSingleCandidate
  });

  if (candidates.length === 0) {
    throw new Error("No benchmark candidate was found in this diff. Pass --extension-id or add extensionName / extensionNameContains when the diff is ambiguous.");
  }

  const extensions = {};
  for (const candidate of candidates) {
    const metrics = buildBenchmarkMetrics(diff, candidate);
    extensions[candidate.extensionId] = {
      label: impactLabel,
      source: normalizedSource,
      metrics,
      notes: buildExportNote({
        source: normalizedSource,
        extensionName: candidate.name ?? candidate.extensionId,
        metrics
      })
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: normalizedSource,
    thresholds: {
      highAtOrAboveBytes: 60 * 1024 * 1024,
      mediumAtOrAboveBytes: 25 * 1024 * 1024,
      lowAtOrAboveBytes: 8 * 1024 * 1024,
      basedOn: "max(totalPrivateDrop, rendererPrivateDrop)"
    },
    extensions
  };
}

async function exportBenchmarkLabels(beforeFile, afterFile, options) {
  const [before, after] = await Promise.all([loadJson(beforeFile), loadJson(afterFile)]);
  const diff = summarizeDiff(before, after);
  const exportPayload = buildBenchmarkExport(diff, options);
  const outputPath = options.out ?? path.join(process.cwd(), "docs", "generated-benchmark-labels.json");
  const existingPayload = await tryReadJson(outputPath);
  const mergedPayload = mergeCatalogPayloads(existingPayload, exportPayload);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(mergedPayload, null, 2), "utf8");

  console.log(`Saved benchmark labels: ${outputPath}`);
  console.log(`Source: ${mergedPayload.source}`);
  console.log(`Extensions in file: ${Object.keys(mergedPayload.extensions).length}`);
  for (const [candidateId, entry] of Object.entries(exportPayload.extensions)) {
    console.log(`- ${candidateId} | label=${entry.label} | ${entry.notes}`);
  }
}

function resolveSpecPath(baseDir, targetPath) {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }
  return path.resolve(baseDir, targetPath);
}

function ensureScenarioSpec(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Catalog spec must be a JSON object.");
  }
  if (!Array.isArray(spec.scenarios) || spec.scenarios.length === 0) {
    throw new Error("Catalog spec must include a non-empty scenarios array.");
  }
}

function toSpecPath(filePath, specDir) {
  const relativePath = path.relative(specDir, filePath);
  return relativePath.split(path.sep).join("/");
}

function defaultDiscoverySource(beforeFile) {
  return `${path.basename(beforeFile, path.extname(beforeFile))}-discovered`;
}

function sanitizeSpecText(value) {
  return String(value ?? "").replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim();
}

async function discoverCatalogScenarios(beforeFile, afterDir, options) {
  const beforePath = path.resolve(beforeFile);
  const afterDirPath = path.resolve(afterDir);
  const outputPath = options.out
    ? path.resolve(options.out)
    : path.join(process.cwd(), "docs", "generated-benchmark-scenarios.json");
  const specDir = path.dirname(outputPath);
  const before = await loadJson(beforePath);
  const entries = await fs.readdir(afterDirPath, { withFileTypes: true });
  const afterFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .filter((entry) => !options.afterPrefix || entry.name.startsWith(options.afterPrefix))
    .map((entry) => path.join(afterDirPath, entry.name))
    .filter((filePath) => path.resolve(filePath) !== beforePath)
    .sort((a, b) => a.localeCompare(b));

  const scenarios = [];
  const skipped = [];

  for (const afterFile of afterFiles) {
    try {
      const after = await loadJson(afterFile);
      const diff = summarizeDiff(before, after);
      const candidates = resolveBenchmarkCandidates(diff, { strictSingleCandidate: true });
      if (candidates.length !== 1) {
        skipped.push({ after: toSpecPath(afterFile, specDir), reason: "No single removed extension target was found." });
        continue;
      }

      const [candidate] = candidates;
      const metrics = buildBenchmarkMetrics(diff, candidate);
      scenarios.push({
        before: toSpecPath(beforePath, specDir),
        after: toSpecPath(afterFile, specDir),
        extensionId: candidate.extensionId,
        extensionName: candidate.name ? sanitizeSpecText(candidate.name) : null,
        summary: {
          totalPrivateDropBytes: metrics.totalPrivateDropBytes,
          rendererPrivateDropBytes: metrics.rendererPrivateDropBytes,
          targetDelta: metrics.targetDelta
        },
        metrics
      });
    } catch (error) {
      skipped.push({ after: toSpecPath(afterFile, specDir), reason: error.message });
    }
  }

  if (scenarios.length === 0) {
    throw new Error("No usable scenarios were discovered. Try --after-prefix or inspect the skipped files in the command output.");
  }

  const spec = {
    source: options.source ?? defaultDiscoverySource(beforePath),
    discovery: {
      before: toSpecPath(beforePath, specDir),
      afterDir: toSpecPath(afterDirPath, specDir),
      afterPrefix: options.afterPrefix ?? null,
      skipped
    },
    scenarios
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), "utf8");

  console.log(`Saved scenario spec: ${outputPath}`);
  console.log(`Scenarios discovered: ${scenarios.length}`);
  console.log(`Files skipped: ${skipped.length}`);
  for (const scenario of scenarios) {
    console.log(`- ${scenario.extensionName ?? scenario.extensionId} (${scenario.extensionId}) | after=${scenario.after}`);
  }
  if (skipped.length > 0) {
    console.log("Skipped files:");
    for (const row of skipped) {
      console.log(`- ${row.after} | ${row.reason}`);
    }
  }
}

async function buildCatalogFromSpec(specFile, options) {
  const specPath = path.resolve(specFile);
  const specDir = path.dirname(specPath);
  const spec = await loadJson(specPath);
  ensureScenarioSpec(spec);

  let catalog = null;
  for (const scenario of spec.scenarios) {
    if (!scenario?.before || !scenario?.after) {
      throw new Error("Each scenario must include before and after snapshot paths.");
    }

    const before = await loadJson(resolveSpecPath(specDir, scenario.before));
    const after = await loadJson(resolveSpecPath(specDir, scenario.after));
    const diff = summarizeDiff(before, after);
    const exportPayload = buildBenchmarkExport(diff, {
      source: scenario.source ?? spec.source ?? options.source,
      extensionId: scenario.extensionId ?? options.extensionId,
      extensionName: scenario.extensionName,
      extensionNameContains: scenario.extensionNameContains,
      strictSingleCandidate: true
    });
    catalog = mergeCatalogPayloads(catalog, exportPayload);
  }

  const outputPath = options.out
    ? path.resolve(options.out)
    : path.join(process.cwd(), "docs", "generated-benchmark-labels.json");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2), "utf8");

  console.log(`Saved benchmark catalog: ${outputPath}`);
  console.log(`Scenarios processed: ${spec.scenarios.length}`);
  console.log(`Extensions in file: ${Object.keys(catalog.extensions ?? {}).length}`);
  for (const [extensionId, entry] of Object.entries(catalog.extensions ?? {})) {
    console.log(`- ${extensionId} | label=${entry.label} | ${entry.notes}`);
  }
}

async function main() {
  const { command, options, positionals } = parseArgs(process.argv.slice(2));
  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "snapshot") {
    await collectSnapshot(options);
    return;
  }

  if (command === "live-estimates") {
    await exportLiveEstimates(options);
    return;
  }

  if (command === "profile-inventory") {
    await exportProfileInventory(options);
    return;
  }

  if (command === "diff") {
    if (positionals.length !== 2) {
      throw new Error("diff requires <before.json> and <after.json>");
    }
    await diffSnapshots(positionals[0], positionals[1]);
    return;
  }

  if (command === "export-labels") {
    if (positionals.length !== 2) {
      throw new Error("export-labels requires <before.json> and <after.json>");
    }
    await exportBenchmarkLabels(positionals[0], positionals[1], options);
    return;
  }

  if (command === "build-catalog") {
    if (positionals.length !== 1) {
      throw new Error("build-catalog requires <scenarios.json>");
    }
    await buildCatalogFromSpec(positionals[0], options);
    return;
  }

  if (command === "discover-scenarios") {
    if (positionals.length !== 2) {
      throw new Error("discover-scenarios requires <before.json> and <after-dir>");
    }
    await discoverCatalogScenarios(positionals[0], positionals[1], options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
