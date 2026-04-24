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
  node ems-measure.mjs diff <before.json> <after.json>
  node ems-measure.mjs export-labels <before.json> <after.json> [--source youtube-3ext-scenario] [--extension-id <id>] [--out docs\\generated-benchmark-labels.json]
  node ems-measure.mjs build-catalog <scenarios.json> [--out docs\\generated-benchmark-labels.json]
  node ems-measure.mjs discover-scenarios <before.json> <after-dir> [--after-prefix yt3-after-] [--source youtube-3ext-scenario] [--out docs\\youtube-benchmark-scenarios.json]

Commands:
  snapshot   Capture CDP targets plus Windows chrome.exe process memory.
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

      let displayName = manifest.name ?? extensionId;
      if (typeof displayName === "string" && displayName.startsWith("__MSG_") && displayName.endsWith("__")) {
        const messageKey = displayName.slice("__MSG_".length, -2);
        const locale = manifest.default_locale;
        if (locale) {
          const messages = await tryReadJson(path.join(basePath, "_locales", locale, "messages.json"));
          const resolved = messages?.[messageKey]?.message;
          if (resolved) {
            displayName = resolved;
          }
        }
      }

      metadata.set(normalizedId, {
        extensionId: normalizedId,
        name: displayName,
        version,
        manifestVersion: manifest.manifest_version ?? null,
        description: manifest.description ?? "",
        disabled: entry.name.endsWith(DISABLED_SUFFIX)
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

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = { id, method, params };
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

async function collectSnapshot({ host, port, out, profileDir }) {
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

  const chromeProcesses = await getWindowsChromeProcesses();
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

  const snapshot = {
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

  const outputPath = out ?? path.join(process.cwd(), "snapshots", `ems-snapshot-${Date.now()}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`Saved snapshot: ${outputPath}`);
  console.log(`Browser: ${version.Browser}`);
  console.log(`Extension targets: ${extensionTargets.length}`);
  console.log(`Chrome processes: ${enrichedProcesses.length}`);
  console.log("Top extension summaries:");
  for (const summary of snapshot.extensionSummaries.slice(0, 10)) {
    console.log(
      `- ${summary.name ?? summary.extensionId} (${summary.extensionId}) | private=${formatBytes(summary.ownedPrivateBytes)} | ws=${formatBytes(summary.ownedWorkingSet)} | targets=${summary.targetCount} | attribution=${summary.attribution}`
    );
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

function buildExportNote({ source, extensionName, totalPrivateDrop, rendererPrivateDrop, targetDelta }) {
  const sourceLabel = source ?? "snapshot-diff-export";
  const safeName = String(extensionName).replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim();
  const targetText = targetDelta < 0 ? "removed target observed" : "target removal not observed";
  return `${sourceLabel}: ${safeName} scenario showed total private drop ${formatCompactBytes(totalPrivateDrop)} and renderer private drop ${formatCompactBytes(rendererPrivateDrop)}; ${targetText}.`;
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
    extensions[candidate.extensionId] = {
      label: impactLabel,
      source: normalizedSource,
      notes: buildExportNote({
        source: normalizedSource,
        extensionName: candidate.name ?? candidate.extensionId,
        totalPrivateDrop,
        rendererPrivateDrop,
        targetDelta: candidate.targetDelta
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
      scenarios.push({
        before: toSpecPath(beforePath, specDir),
        after: toSpecPath(afterFile, specDir),
        extensionId: candidate.extensionId,
        extensionName: candidate.name ? sanitizeSpecText(candidate.name) : null,
        summary: {
          totalPrivateDropBytes: Math.max(0, -diff.sessionDelta.totalPrivate),
          rendererPrivateDropBytes: Math.max(0, -diff.sessionDelta.rendererPrivate),
          targetDelta: candidate.targetDelta
        }
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
