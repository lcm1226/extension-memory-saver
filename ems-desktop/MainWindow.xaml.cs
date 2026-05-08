using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;

namespace EmsDesktop;

public partial class MainWindow : Window
{
    private readonly string _repoRoot;
    private readonly string _enginePath;
    private CancellationTokenSource? _runCancellation;
    private bool _loadingBrowsers;

    public ObservableCollection<BrowserItem> BrowserItems { get; } = new();
    public ObservableCollection<ResultItem> ResultItems { get; } = new();

    public MainWindow()
    {
        InitializeComponent();
        DataContext = this;
        _repoRoot = FindRepoRoot();
        _enginePath = Path.Combine(_repoRoot, "tools", "ems-desktop-engine.mjs");
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        await RefreshBrowsersAsync(autoStart: true);
    }

    private async void RefreshBrowsers_Click(object sender, RoutedEventArgs e)
    {
        await RefreshBrowsersAsync(autoStart: true);
    }

    private void CancelRun_Click(object sender, RoutedEventArgs e)
    {
        _runCancellation?.Cancel();
        StatusText.Text = "Cancel requested.";
    }

    private async void BrowserCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loadingBrowsers || BrowserCombo.SelectedItem is not BrowserItem browser)
        {
            return;
        }
        await StartCalibrationAsync(browser);
    }

    private async Task RefreshBrowsersAsync(bool autoStart)
    {
        _loadingBrowsers = true;
        _runCancellation?.Cancel();
        BrowserItems.Clear();
        ResultItems.Clear();
        BrowserCombo.SelectedItem = null;
        RunProgress.IsIndeterminate = true;
        StatusText.Text = "Scanning debug-enabled Chromium browsers...";
        ActiveTitleText.Text = "No active page selected";
        ActiveUrlText.Text = "-";

        try
        {
            string json = await RunEngineCaptureAsync("list-browsers", "--json");
            using JsonDocument doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("warnings", out JsonElement warnings))
            {
                foreach (JsonElement warning in warnings.EnumerateArray())
                {
                    BrowserHelpText.Text = warning.GetString() ?? BrowserHelpText.Text;
                    break;
                }
            }
            foreach (JsonElement item in doc.RootElement.GetProperty("browsers").EnumerateArray())
            {
                BrowserItems.Add(BrowserItem.FromJson(item));
            }

            if (BrowserItems.Count == 0)
            {
                StatusText.Text = "No measurable browser found. Launch Chrome with --remote-debugging-port, then refresh.";
                return;
            }

            BrowserItem selected = BrowserItems.FirstOrDefault(b => b.Reachable && !string.IsNullOrWhiteSpace(b.ActiveUrl)) ?? BrowserItems[0];
            BrowserCombo.SelectedItem = selected;
            ApplyBrowserInfo(selected);
            StatusText.Text = $"Selected {selected.DisplayName}.";

            _loadingBrowsers = false;
            if (autoStart)
            {
                await StartCalibrationAsync(selected);
            }
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message;
        }
        finally
        {
            _loadingBrowsers = false;
            RunProgress.IsIndeterminate = false;
        }
    }

    private void ApplyBrowserInfo(BrowserItem browser)
    {
        ActiveTitleText.Text = string.IsNullOrWhiteSpace(browser.ActiveTitle) ? "No active HTTP(S) page detected" : browser.ActiveTitle;
        ActiveUrlText.Text = string.IsNullOrWhiteSpace(browser.ActiveUrl) ? "-" : browser.ActiveUrl;
    }

    private async Task StartCalibrationAsync(BrowserItem browser)
    {
        _runCancellation?.Cancel();
        _runCancellation = new CancellationTokenSource();
        CancellationToken token = _runCancellation.Token;

        ResultItems.Clear();
        ApplyBrowserInfo(browser);
        RunProgress.IsIndeterminate = true;
        StatusText.Text = "Starting clone-based A/B measurement...";

        try
        {
            await RunCalibrationProcessAsync(browser, token);
        }
        catch (OperationCanceledException)
        {
            StatusText.Text = "Run cancelled.";
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message;
        }
        finally
        {
            RunProgress.IsIndeterminate = false;
        }
    }

    private async Task RunCalibrationProcessAsync(BrowserItem browser, CancellationToken token)
    {
        using Process process = CreateNodeProcess("calibrate-auto", "--browser-id", browser.Id, "--jsonl", "--max-extensions", "6");
        process.Start();
        using CancellationTokenRegistration registration = token.Register(() => KillProcessTree(process.Id));

        Task<string> stderrTask = process.StandardError.ReadToEndAsync(token);
        while (!process.StandardOutput.EndOfStream)
        {
            token.ThrowIfCancellationRequested();
            string? line = await process.StandardOutput.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }
            HandleEngineEvent(line);
        }

        await process.WaitForExitAsync(token);
        string stderr = await stderrTask;
        if (process.ExitCode != 0 && !string.IsNullOrWhiteSpace(stderr))
        {
            throw new InvalidOperationException(stderr.Trim());
        }
    }

    private void HandleEngineEvent(string line)
    {
        using JsonDocument doc = JsonDocument.Parse(line);
        JsonElement root = doc.RootElement;
        string? eventName = root.TryGetProperty("event", out JsonElement eventElement) ? eventElement.GetString() : null;
        switch (eventName)
        {
            case "start":
                StatusText.Text = "Cloning selected profile for safe measurement...";
                break;
            case "candidates":
                int count = root.GetProperty("count").GetInt32();
                int total = root.GetProperty("totalMatchingBeforeLimit").GetInt32();
                StatusText.Text = $"Measuring {count} site-relevant extension(s). Matching before cap: {total}.";
                break;
            case "candidate":
                int index = root.GetProperty("index").GetInt32();
                int candidateTotal = root.GetProperty("total").GetInt32();
                string name = root.GetProperty("extension").GetProperty("name").GetString() ?? "extension";
                StatusText.Text = $"Measuring {index}/{candidateTotal}: {name}";
                break;
            case "result":
                ResultItems.Add(ResultItem.FromJson(root.GetProperty("result")));
                break;
            case "complete":
                StatusText.Text = $"Complete. {ResultItems.Count} result(s).";
                break;
            case "error":
                StatusText.Text = root.GetProperty("message").GetString() ?? "Engine error.";
                break;
        }
    }

    private async Task<string> RunEngineCaptureAsync(params string[] args)
    {
        using Process process = CreateNodeProcess(args);
        process.Start();
        string stdout = await process.StandardOutput.ReadToEndAsync();
        string stderr = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? stdout : stderr);
        }
        return stdout;
    }

    private Process CreateNodeProcess(params string[] args)
    {
        string allArguments = string.Join(" ", new[] { Quote(_enginePath) }.Concat(args.Select(Quote)));
        return new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "node",
                Arguments = allArguments,
                WorkingDirectory = _repoRoot,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            },
            EnableRaisingEvents = true
        };
    }

    private static string Quote(string value)
    {
        if (value.StartsWith("--", StringComparison.Ordinal))
        {
            return value;
        }
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void KillProcessTree(int processId)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "taskkill",
                Arguments = $"/PID {processId} /T /F",
                UseShellExecute = false,
                CreateNoWindow = true
            })?.WaitForExit(5000);
        }
        catch
        {
            // Best-effort cancellation cleanup.
        }
    }

    private static string FindRepoRoot()
    {
        DirectoryInfo? dir = new(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "tools", "ems-desktop-engine.mjs")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("Could not find repo root containing tools/ems-desktop-engine.mjs.");
    }
}

public sealed class BrowserItem
{
    public string Id { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string ActiveTitle { get; init; } = "";
    public string ActiveUrl { get; init; } = "";
    public bool Reachable { get; init; }
    public string Warning { get; init; } = "";

    public static BrowserItem FromJson(JsonElement item)
    {
        return new BrowserItem
        {
            Id = ReadString(item, "id"),
            DisplayName = ReadString(item, "displayName"),
            ActiveTitle = ReadString(item, "activeTitle"),
            ActiveUrl = ReadString(item, "activeUrl"),
            Reachable = item.TryGetProperty("reachable", out JsonElement reachable) && reachable.GetBoolean(),
            Warning = ReadString(item, "warning")
        };
    }

    private static string ReadString(JsonElement item, string name)
    {
        return item.TryGetProperty(name, out JsonElement value) && value.ValueKind != JsonValueKind.Null ? value.GetString() ?? "" : "";
    }
}

public sealed class ResultItem
{
    public string Name { get; init; } = "";
    public string EstimatedPrivateDrop { get; init; } = "";
    public string Confidence { get; init; } = "";
    public string TargetChange { get; init; } = "";
    public string Notes { get; init; } = "";

    public static ResultItem FromJson(JsonElement item)
    {
        int beforeTargets = item.TryGetProperty("beforeTargets", out JsonElement before) ? before.GetInt32() : 0;
        int afterTargets = item.TryGetProperty("afterTargets", out JsonElement after) ? after.GetInt32() : 0;
        return new ResultItem
        {
            Name = ReadString(item, "name"),
            EstimatedPrivateDrop = ReadString(item, "estimatedPrivateDrop"),
            Confidence = ReadString(item, "confidence"),
            TargetChange = $"{beforeTargets}->{afterTargets}",
            Notes = ReadString(item, "notes")
        };
    }

    private static string ReadString(JsonElement item, string name)
    {
        return item.TryGetProperty(name, out JsonElement value) && value.ValueKind != JsonValueKind.Null ? value.GetString() ?? "" : "";
    }
}
