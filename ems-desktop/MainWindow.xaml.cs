using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;

namespace EmsDesktop;

public enum UiLanguage
{
    English,
    Korean
}

public partial class MainWindow : Window
{
    private readonly string _repoRoot;
    private readonly string _enginePath;
    private readonly string _nodePath;
    private readonly Dictionary<string, string> _resultJsonByExtensionId = new();
    private UiLanguage _language = UiLanguage.English;
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
        _nodePath = FindNodeRuntime(_repoRoot);
        ApplyLanguage();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        await RefreshBrowsersAsync(autoStart: true);
    }

    private async void RefreshBrowsers_Click(object sender, RoutedEventArgs e)
    {
        await RefreshBrowsersAsync(autoStart: true);
    }

    private void LanguageCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (FooterText is null)
        {
            return;
        }

        if (LanguageCombo?.SelectedItem is ComboBoxItem item && string.Equals(item.Tag?.ToString(), "ko", StringComparison.OrdinalIgnoreCase))
        {
            _language = UiLanguage.Korean;
        }
        else
        {
            _language = UiLanguage.English;
        }

        ApplyLanguage();
        RebuildResultsForLanguage();
    }

    private bool IsKorean => _language == UiLanguage.Korean;

    private string Ui(string english, string korean) => IsKorean ? korean : english;

    private void SetStatus(string english, string korean) => StatusText.Text = Ui(english, korean);

    private string ErrorStatus(string message) => Ui($"Error: {message}", $"\uC624\uB958: {LocalizeEngineMessage(message)}");

    private string LocalizeEngineMessage(string message)
    {
        if (!IsKorean || string.IsNullOrWhiteSpace(message)) return message;
        if (message == "Only Chromium instances launched with --remote-debugging-port can be measured." ||
            message == "Only Probe Chrome or advanced Chromium instances with a DevTools endpoint can be measured.")
        {
            return "프로브 Chrome 또는 DevTools endpoint가 켜진 고급 Chromium만 측정할 수 있습니다.";
        }
        if (message.StartsWith("Could not inspect chrome.exe command lines:", StringComparison.Ordinal))
        {
            return "chrome.exe \uBA85\uB839\uC904\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: " + message["Could not inspect chrome.exe command lines:".Length..].Trim();
        }
        if (message == "No browser selected. Pass --browser-id from list-browsers.")
        {
            return "\uBE0C\uB77C\uC6B0\uC800\uAC00 \uC120\uD0DD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uBAA9\uB85D\uC5D0\uC11C \uCE21\uC815\uD560 \uBE0C\uB77C\uC6B0\uC800/\uD504\uB85C\uD544\uC744 \uC120\uD0DD\uD558\uC138\uC694.";
        }
        if (message.StartsWith("Selected browser is not reachable:", StringComparison.Ordinal))
        {
            return "\uC120\uD0DD\uD55C \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: " + message["Selected browser is not reachable:".Length..].Trim();
        }
        if (message == "Selected browser does not expose enough profile path information for safe clone-based calibration.")
        {
            return "\uC120\uD0DD\uD55C \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC548\uC804\uD55C clone \uCE21\uC815\uC5D0 \uD544\uC694\uD55C \uD504\uB85C\uD544 \uACBD\uB85C \uC815\uBCF4\uB97C \uCDA9\uBD84\uD788 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
        }
        if (message == "Selected browser active target is not a standard http(s) page.")
        {
            return "\uC120\uD0DD\uD55C \uBE0C\uB77C\uC6B0\uC800\uC758 \uD65C\uC131 \uD398\uC774\uC9C0\uAC00 \uC77C\uBC18 http(s) \uD398\uC774\uC9C0\uAC00 \uC544\uB2D9\uB2C8\uB2E4.";
        }
        if (message.StartsWith("No enabled installed extensions declare access to ", StringComparison.Ordinal))
        {
            string url = message["No enabled installed extensions declare access to ".Length..].TrimEnd('.');
            return $"{url}\uC5D0 \uC811\uADFC \uAD8C\uD55C\uC744 \uC120\uC5B8\uD55C \uD65C\uC131 \uD655\uC7A5 \uD504\uB85C\uADF8\uB7A8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
        }
        if (message.StartsWith("Chrome DevTools endpoint did not become reachable on port ", StringComparison.Ordinal))
        {
            return "Chrome DevTools endpoint\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: " + message["Chrome DevTools endpoint did not become reachable on port ".Length..];
        }
        if (message.StartsWith("PowerShell timed out after ", StringComparison.Ordinal))
        {
            return "PowerShell \uC2E4\uD589 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4: " + message["PowerShell timed out after ".Length..];
        }
        if (message.StartsWith("Failed to parse PowerShell JSON:", StringComparison.Ordinal))
        {
            return "PowerShell JSON \uACB0\uACFC\uB97C \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: " + message["Failed to parse PowerShell JSON:".Length..].Trim();
        }
        if (message == "Engine error.") return "\uC5D4\uC9C4 \uC624\uB958.";
        return message;
    }

    private void ApplyLanguage()
    {
        SubtitleText.Text = Ui("Desktop companion for approximate extension memory impact in Probe Chrome.", "프로브 Chrome에서 확장 프로그램의 대략적인 메모리 영향을 측정하는 데스크톱 도구입니다.");
        LanguageLabel.Text = Ui("Language", "언어");
        SafeCloneTitleText.Text = Ui("Safe clone measurement", "안전한 복제 측정");
        SafeCloneBodyText.Text = Ui("Live profile is never modified", "실제 프로필은 수정하지 않음");
        Step1TitleText.Text = Ui("1. Launch probe Chrome", "1. 프로브 Chrome 실행");
        Step1BodyText.Text = Ui("Use the button below. This opens a separate measurement profile.", "아래 버튼으로 별도의 측정용 프로필을 엽니다.");
        Step2TitleText.Text = Ui("2. Open the target page", "2. 측정할 페이지 열기");
        Step2BodyText.Text = Ui("Install or enable extensions in that probe profile, then open the page to measure.", "프로브 프로필에 확장을 설치하거나 켠 뒤 측정할 페이지를 엽니다.");
        Step3TitleText.Text = Ui("3. Read measured deltas", "3. 측정 결과 확인");
        Step3BodyText.Text = Ui("Cached values appear first. A headless worker refreshes results in the background.", "캐시된 값이 먼저 표시되고 백그라운드 worker가 결과를 갱신합니다.");
        BrowserLabelText.Text = Ui("Probe Chrome profile", "프로브 Chrome 프로필");
        BrowserHelpText.Text = Ui("Launch Probe Chrome, install or enable target extensions, open the page, then refresh. Advanced manually launched Chromium instances also appear here.", "프로브 Chrome을 실행하고 측정할 확장을 설치하거나 켠 뒤 페이지를 열고 새로고침하세요. 고급 사용자가 직접 실행한 Chromium도 여기에 표시됩니다.");
        LaunchProbeButton.Content = Ui("Launch Probe Chrome", "프로브 Chrome 실행");
        RefreshButton.Content = Ui("Refresh Profiles", "프로필 새로고침");
        CancelButton.Content = Ui("Cancel Run", "측정 취소");
        MedianRunsCheck.Content = Ui("Median x3 for higher confidence (slower)", "신뢰도 향상용 Median x3 (느림)");
        MedianRunsCheck.ToolTip = Ui("Runs three A/B samples per extension and reports the median delta.", "확장 프로그램마다 A/B 샘플을 3회 실행하고 median delta를 표시합니다.");
        ActivePageLabelText.Text = Ui("Active page", "활성 페이지");
        RunStatusLabelText.Text = Ui("Run status", "측정 상태");
        SafetyBannerText.Text = Ui("Safety: EMS clones the selected profile before disabling extensions. Measurements run in the clone only; the selected live profile and installed extensions are not mutated.", "안전 원칙: EMS는 확장을 비활성화하기 전에 선택한 프로필을 복제합니다. 측정은 clone에서만 실행되며 실제 프로필과 설치된 확장은 수정하지 않습니다.");
        FooterText.Text = Ui("Values are approximate A/B deltas from cloned probe profiles, not exact Chrome memory ownership. Page state, ads, video playback, cache, and network activity can move results.", "값은 복제된 프로브 프로필에서 얻은 대략적인 A/B delta이며 정확한 Chrome 메모리 소유량이 아닙니다. 페이지 상태, 광고, 영상 재생, 캐시, 네트워크 활동에 따라 달라질 수 있습니다.");

        ExtensionColumn.Header = Ui("Extension", "확장 프로그램");
        ImpactColumn.Header = Ui("Approx. impact", "예상 영향");
        SourceColumn.Header = Ui("Source", "출처");
        WorkerColumn.Header = Ui("Worker", "작업 방식");
        ConfidenceColumn.Header = Ui("Confidence", "신뢰도");
        SamplesColumn.Header = Ui("Samples", "샘플");
        TargetsColumn.Header = Ui("Targets", "타겟");
        NotesColumn.Header = Ui("Notes", "메모");

        if (ActiveTitleText.Text is "No active page selected" or "선택된 활성 페이지 없음") ActiveTitleText.Text = Ui("No active page selected", "선택된 활성 페이지 없음");
        if (ActiveTitleText.Text is "No active HTTP(S) page detected" or "활성 HTTP(S) 페이지를 찾지 못함") ActiveTitleText.Text = Ui("No active HTTP(S) page detected", "활성 HTTP(S) 페이지를 찾지 못함");
        if (StatusText.Text is "Idle" or "대기 중") StatusText.Text = Ui("Idle", "대기 중");
        if (ProgressText.Text is "No run in progress" or "진행 중인 측정 없음") ProgressText.Text = Ui("No run in progress", "진행 중인 측정 없음");
    }

    private void RebuildResultsForLanguage()
    {
        if (_resultJsonByExtensionId.Count == 0) return;
        List<string> rawRows = _resultJsonByExtensionId.Values.ToList();
        ResultItems.Clear();
        foreach (string raw in rawRows)
        {
            using JsonDocument doc = JsonDocument.Parse(raw);
            ResultItems.Add(ResultItem.FromJson(doc.RootElement, _language));
        }
    }

    private async void LaunchProbeChrome_Click(object sender, RoutedEventArgs e)
    {
        _runCancellation?.Cancel();
        RunProgress.IsIndeterminate = true;
        SetStatus("Launching Probe Chrome measurement profile...", "프로브 Chrome 측정 프로필을 실행하는 중...");
        try
        {
            string scriptPath = Path.Combine(_repoRoot, "tools", "Start-EMSDesktopProbeChrome.ps1");
            string url = string.IsNullOrWhiteSpace(ActiveUrlText.Text) || ActiveUrlText.Text == "-" ? "https://www.youtube.com/" : ActiveUrlText.Text;
            await RunPowerShellCaptureAsync("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Url", url);
            SetStatus("Probe Chrome launched. Refreshing browser list...", "프로브 Chrome을 실행했습니다. 브라우저 목록을 새로고침하는 중...");
            await RefreshBrowsersAsync(autoStart: true);
        }
        catch (Exception ex)
        {
            StatusText.Text = ErrorStatus(ex.Message);
        }
        finally
        {
            RunProgress.IsIndeterminate = false;
        }
    }
    private void CancelRun_Click(object sender, RoutedEventArgs e)
    {
        _runCancellation?.Cancel();
        SetStatus("Cancel requested.", "측정 취소를 요청했습니다.");
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
        _resultJsonByExtensionId.Clear();
        BrowserCombo.SelectedItem = null;
        RunProgress.IsIndeterminate = true;
        SetStatus("Looking for Probe Chrome profiles...", "프로브 Chrome 프로필을 찾는 중...");
        ActiveTitleText.Text = Ui("No active page selected", "선택된 활성 페이지 없음");
        ActiveUrlText.Text = "-";

        try
        {
            string json = await RunEngineCaptureAsync("list-browsers", "--json");
            using JsonDocument doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("warnings", out JsonElement warnings))
            {
                foreach (JsonElement warning in warnings.EnumerateArray())
                {
                    BrowserHelpText.Text = LocalizeEngineMessage(warning.GetString() ?? BrowserHelpText.Text);
                    break;
                }
            }
            foreach (JsonElement item in doc.RootElement.GetProperty("browsers").EnumerateArray())
            {
                BrowserItems.Add(BrowserItem.FromJson(item));
            }

            if (BrowserItems.Count == 0)
            {
                SetStatus("No Probe Chrome profile found. Click Launch Probe Chrome, open the target page, then refresh.", "프로브 Chrome 프로필을 찾지 못했습니다. 프로브 Chrome 실행을 누르고 대상 페이지를 연 뒤 새로고침하세요.");
                return;
            }

            BrowserItem selected = BrowserItems.FirstOrDefault(b => b.Reachable && !string.IsNullOrWhiteSpace(b.ActiveUrl)) ?? BrowserItems[0];
            BrowserCombo.SelectedItem = selected;
            ApplyBrowserInfo(selected);
            StatusText.Text = Ui($"Selected {selected.DisplayName}.", $"선택됨: {selected.DisplayName}.");

            _loadingBrowsers = false;
            if (autoStart)
            {
                await StartCalibrationAsync(selected);
            }
        }
        catch (Exception ex)
        {
            StatusText.Text = ErrorStatus(ex.Message);
        }
        finally
        {
            _loadingBrowsers = false;
            RunProgress.IsIndeterminate = false;
        }
    }

    private void ApplyBrowserInfo(BrowserItem browser)
    {
        ActiveTitleText.Text = string.IsNullOrWhiteSpace(browser.ActiveTitle) ? Ui("No active HTTP(S) page detected", "활성 HTTP(S) 페이지를 찾지 못함") : browser.ActiveTitle;
        ActiveUrlText.Text = string.IsNullOrWhiteSpace(browser.ActiveUrl) ? "-" : browser.ActiveUrl;
    }

    private async Task StartCalibrationAsync(BrowserItem browser)
    {
        _runCancellation?.Cancel();
        _runCancellation = new CancellationTokenSource();
        CancellationToken token = _runCancellation.Token;

        ResultItems.Clear();
        _resultJsonByExtensionId.Clear();
        ApplyBrowserInfo(browser);
        int repeatRuns = SelectedRepeatRuns();
        RunProgress.IsIndeterminate = true;
        RunProgress.Value = 0;
        ProgressText.Text = repeatRuns > 1 ? Ui("Median x3 enabled. Waiting for candidate queue...", "Median x3가 켜졌습니다. 후보 대기열을 기다리는 중...") : Ui("Waiting for candidate queue...", "후보 대기열을 기다리는 중...");
        StatusText.Text = repeatRuns > 1
            ? Ui("Starting background median measurement. Cached x3 results appear first when available...", "백그라운드 median 측정을 시작합니다. 캐시된 x3 결과가 있으면 먼저 표시됩니다...")
            : Ui("Starting background measurement. Cached results appear first when available...", "백그라운드 측정을 시작합니다. 캐시 결과가 있으면 먼저 표시됩니다...");

        try
        {
            await RunCalibrationProcessAsync(browser, token);
        }
        catch (OperationCanceledException)
        {
            SetStatus("Run cancelled.", "측정이 취소되었습니다.");
        }
        catch (Exception ex)
        {
            StatusText.Text = ErrorStatus(ex.Message);
        }
        finally
        {
            RunProgress.IsIndeterminate = false;
        }
    }

    private async Task RunCalibrationProcessAsync(BrowserItem browser, CancellationToken token)
    {
        int repeatRuns = SelectedRepeatRuns();
        using Process process = CreateNodeProcess("calibrate-auto", "--browser-id", browser.Id, "--jsonl", "--max-extensions", "6", "--repeat-runs", repeatRuns.ToString());
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

    private void UpsertResult(JsonElement item)
    {
        ResultItem incoming = ResultItem.FromJson(item, _language);
        _resultJsonByExtensionId[incoming.ExtensionId] = item.GetRawText();
        for (int index = 0; index < ResultItems.Count; index += 1)
        {
            if (ResultItems[index].ExtensionId == incoming.ExtensionId)
            {
                ResultItems[index] = incoming;
                return;
            }
        }
        ResultItems.Add(incoming);
    }

    private int SelectedRepeatRuns() => MedianRunsCheck.IsChecked == true ? 3 : 1;

    private void HandleEngineEvent(string line)
    {
        using JsonDocument doc = JsonDocument.Parse(line);
        JsonElement root = doc.RootElement;
        string? eventName = root.TryGetProperty("event", out JsonElement eventElement) ? eventElement.GetString() : null;
        switch (eventName)
        {
            case "start":
                int startRepeatRuns = ReadInt(root, "repeatRuns", SelectedRepeatRuns());
                ProgressText.Text = startRepeatRuns > 1 ? Ui($"Preparing clones for median x{startRepeatRuns} measurement...", $"Median x{startRepeatRuns} 측정을 위한 clone을 준비하는 중...") : Ui("Preparing clone for measurement...", "측정용 clone을 준비하는 중...");
                SetStatus("Preparing safe clone for background measurement...", "백그라운드 측정을 위한 안전한 clone을 준비하는 중...");
                break;
            case "candidates":
                int count = root.GetProperty("count").GetInt32();
                int total = root.GetProperty("totalMatchingBeforeLimit").GetInt32();
                int repeatTotal = ReadInt(root, "repeatRuns", 1);
                RunProgress.IsIndeterminate = false;
                RunProgress.Minimum = 0;
                RunProgress.Maximum = Math.Max(1, count * repeatTotal);
                RunProgress.Value = 0;
                ProgressText.Text = Ui($"0 / {count * repeatTotal} sample(s) queued", $"0 / {count * repeatTotal}개 샘플 대기 중");
                StatusText.Text = repeatTotal > 1
                    ? Ui($"Queued {count} site-relevant extension(s), median x{repeatTotal}. Matching before cap: {total}.", $"이 사이트 관련 확장 {count}개를 대기열에 추가했습니다. median x{repeatTotal}. 제한 전 매칭: {total}개.")
                    : Ui($"Queued {count} site-relevant extension(s). Matching before cap: {total}.", $"이 사이트 관련 확장 {count}개를 대기열에 추가했습니다. 제한 전 매칭: {total}개.");
                break;
            case "cached-results":
                foreach (JsonElement result in root.GetProperty("results").EnumerateArray())
                {
                    UpsertResult(result);
                }
                ProgressText.Text = Ui($"Showing {ResultItems.Count} cached result(s) while background refresh continues", $"백그라운드 갱신 중 캐시 결과 {ResultItems.Count}개 표시 중");
                StatusText.Text = Ui($"Showing {ResultItems.Count} cached result(s). Refreshing in background...", $"캐시 결과 {ResultItems.Count}개를 표시합니다. 백그라운드에서 갱신 중...");
                break;
            case "worker-mode":
                string mode = root.GetProperty("mode").GetString() ?? "worker";
                StatusText.Text = Ui($"Background worker mode: {mode}.", $"백그라운드 작업 방식: {ResultItem.LocalizeMode(mode, _language)}.");
                break;
            case "fallback":
                string from = root.GetProperty("from").GetString() ?? "worker";
                string to = root.GetProperty("to").GetString() ?? "fallback";
                StatusText.Text = Ui($"Headless worker failed from {from}; retrying with {to} fallback.", $"{ResultItem.LocalizeMode(from, _language)} 작업이 실패했습니다. {ResultItem.LocalizeMode(to, _language)} fallback으로 재시도합니다.");
                break;
            case "candidate":
                int index = root.GetProperty("index").GetInt32();
                int candidateTotal = root.GetProperty("total").GetInt32();
                int repeatIndex = ReadInt(root, "repeatIndex", 1);
                int candidateRepeatTotal = ReadInt(root, "repeatTotal", 1);
                string name = root.GetProperty("extension").GetProperty("name").GetString() ?? "extension";
                string candidateMode = root.TryGetProperty("measurementMode", out JsonElement candidateModeElement) ? candidateModeElement.GetString() ?? "worker" : "worker";
                int completedBefore = ((index - 1) * candidateRepeatTotal) + Math.Max(0, repeatIndex - 1);
                RunProgress.IsIndeterminate = false;
                RunProgress.Maximum = Math.Max(RunProgress.Maximum, candidateTotal * candidateRepeatTotal);
                RunProgress.Value = Math.Min(RunProgress.Maximum, completedBefore);
                ProgressText.Text = Ui($"{completedBefore} / {candidateTotal * candidateRepeatTotal} sample(s) complete", $"{completedBefore} / {candidateTotal * candidateRepeatTotal}개 샘플 완료");
                StatusText.Text = candidateRepeatTotal > 1
                    ? Ui($"Refreshing {index}/{candidateTotal}, sample {repeatIndex}/{candidateRepeatTotal} in {candidateMode}: {name}", $"갱신 중 {index}/{candidateTotal}, 샘플 {repeatIndex}/{candidateRepeatTotal}, {ResultItem.LocalizeMode(candidateMode, _language)}: {name}")
                    : Ui($"Refreshing {index}/{candidateTotal} in {candidateMode}: {name}", $"갱신 중 {index}/{candidateTotal}, {ResultItem.LocalizeMode(candidateMode, _language)}: {name}");
                break;
            case "result":
                UpsertResult(root.GetProperty("result"));
                int resultIndex = ReadInt(root, "index", ResultItems.Count);
                int resultTotal = ReadInt(root, "total", Math.Max(resultIndex, ResultItems.Count));
                int resultRepeatTotal = ReadInt(root, "repeatTotal", 1);
                RunProgress.IsIndeterminate = false;
                RunProgress.Maximum = Math.Max(RunProgress.Maximum, resultTotal * resultRepeatTotal);
                RunProgress.Value = Math.Min(RunProgress.Maximum, resultIndex * resultRepeatTotal);
                ProgressText.Text = Ui($"{(int)RunProgress.Value} / {(int)RunProgress.Maximum} sample(s) complete", $"{(int)RunProgress.Value} / {(int)RunProgress.Maximum}개 샘플 완료");
                break;
            case "complete":
                RunProgress.IsIndeterminate = false;
                if (RunProgress.Maximum > 0) RunProgress.Value = RunProgress.Maximum;
                ProgressText.Text = Ui($"Complete. {ResultItems.Count} result row(s).", $"완료. 결과 행 {ResultItems.Count}개.");
                StatusText.Text = Ui($"Complete. {ResultItems.Count} result(s) refreshed.", $"완료. 결과 {ResultItems.Count}개를 갱신했습니다.");
                break;
            case "error":
                string message = root.GetProperty("message").GetString() ?? "Engine error.";
                StatusText.Text = Ui(message, $"\uC5D4\uC9C4 \uC624\uB958: {LocalizeEngineMessage(message)}");
                break;
        }
    }

    private static int ReadInt(JsonElement item, string name, int fallback)
    {
        return item.TryGetProperty(name, out JsonElement value) && value.TryGetInt32(out int parsed) ? parsed : fallback;
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

    private async Task<string> RunPowerShellCaptureAsync(params string[] args)
    {
        using Process process = new()
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "powershell",
                Arguments = string.Join(" ", args.Select(Quote)),
                WorkingDirectory = _repoRoot,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }
        };
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
                FileName = _nodePath,
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

    private static string FindNodeRuntime(string repoRoot)
    {
        string[] candidates =
        {
            Path.Combine(repoRoot, "runtime", "node", "node.exe"),
            Path.Combine(repoRoot, "node.exe")
        };

        foreach (string candidate in candidates)
        {
            if (File.Exists(candidate)) return candidate;
        }

        return "node";
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
    public string ExtensionId { get; init; } = "";
    public string Name { get; init; } = "";
    public string EstimatedPrivateDrop { get; init; } = "";
    public string Source { get; init; } = "";
    public string Mode { get; init; } = "";
    public string Confidence { get; init; } = "";
    public string TargetChange { get; init; } = "";
    public string SampleInfo { get; init; } = "";
    public string Notes { get; init; } = "";
    public string ImpactBrush { get; init; } = "#30343A";
    public string SourceBrush { get; init; } = "#30343A";
    public string ModeBrush { get; init; } = "#30343A";
    public string ConfidenceBrush { get; init; } = "#30343A";
    public string TagForeground { get; init; } = "#F5F1E8";

    public static ResultItem FromJson(JsonElement item, UiLanguage language)
    {
        int beforeTargets = ReadInt(item, "beforeTargets", 0);
        int afterTargets = ReadInt(item, "afterTargets", 0);
        double estimatedBytes = ReadDouble(item, "estimatedPrivateDropBytes", 0);
        int sampleCount = ReadInt(item, "sampleCount", ReadInt(item, "repeatRuns", 1));
        double spreadBytes = ReadDouble(item, "spreadBytes", 0);
        string source = ReadString(item, "cacheStatus");
        string mode = ReadString(item, "measurementMode");
        string confidence = ReadString(item, "confidence");

        return new ResultItem
        {
            ExtensionId = ReadString(item, "extensionId"),
            Name = ReadString(item, "name"),
            EstimatedPrivateDrop = string.IsNullOrWhiteSpace(ReadString(item, "estimatedPrivateDrop")) ? FormatBytes(estimatedBytes) : ReadString(item, "estimatedPrivateDrop"),
            Source = LocalizeSource(source, language),
            Mode = LocalizeMode(mode, language),
            Confidence = LocalizeConfidence(confidence, language),
            TargetChange = $"{beforeTargets}->{afterTargets}",
            SampleInfo = sampleCount > 1
                ? (language == UiLanguage.Korean ? $"{sampleCount}회 샘플, 편차 {FormatBytes(spreadBytes)}" : $"{sampleCount} samples, spread {FormatBytes(spreadBytes)}")
                : (language == UiLanguage.Korean ? "1회 샘플" : "1 sample"),
            Notes = LocalizeNotes(ReadString(item, "notes"), language),
            ImpactBrush = ImpactBrushFor(estimatedBytes),
            SourceBrush = SourceBrushFor(source),
            ModeBrush = ModeBrushFor(mode),
            ConfidenceBrush = ConfidenceBrushFor(confidence)
        };
    }

    public static string LocalizeMode(string value, UiLanguage language)
    {
        string normalized = DisplayTag(value);
        if (language != UiLanguage.Korean) return normalized;
        return normalized switch
        {
            "headless" => "백그라운드",
            "offscreen" => "오프스크린",
            "visible" => "표시됨",
            "worker" => "작업자",
            _ => normalized
        };
    }

    private static string LocalizeSource(string value, UiLanguage language)
    {
        string normalized = DisplayTag(value);
        if (language != UiLanguage.Korean) return normalized;
        return normalized switch
        {
            "measured" => "측정됨",
            "cached" => "캐시됨",
            _ => normalized
        };
    }

    private static string LocalizeConfidence(string value, UiLanguage language)
    {
        string normalized = DisplayTag(value);
        if (language != UiLanguage.Korean) return normalized;
        return normalized switch
        {
            "high" => "높음",
            "medium" => "보통",
            "low" => "낮음",
            _ => normalized
        };
    }

    private static string LocalizeNotes(string notes, UiLanguage language)
    {
        if (language != UiLanguage.Korean || string.IsNullOrWhiteSpace(notes)) return notes;
        string value = notes;
        value = value.Replace("Other extension target counts changed during this A/B run, so treat this as a rough estimate.", "이 A/B 실행 중 다른 확장 target 수도 변했습니다. 대략적인 추정값으로 보세요.");
        value = value.Replace("No unrelated extension target-count contamination was observed.", "관련 없는 확장 target 수 변화는 관측되지 않았습니다.");
        value = System.Text.RegularExpressions.Regex.Replace(value, @"Cached ([^.]+)\. Background refresh is running\.", "캐시 시각: $1. 백그라운드 갱신 중입니다.");
        value = System.Text.RegularExpressions.Regex.Replace(value, @"Median of (\d+)/(\d+) A/B samples; sample spread ([^.]+)\.", "$1/$2회 A/B 샘플 median; 샘플 편차 $3.");
        value = value.Replace("At least one sample had unrelated extension target-count changes.", "하나 이상의 샘플에서 관련 없는 확장 target 수 변화가 있었습니다.");
        return value;
    }

    private static string ReadString(JsonElement item, string name)
    {
        return item.TryGetProperty(name, out JsonElement value) && value.ValueKind != JsonValueKind.Null ? value.GetString() ?? "" : "";
    }

    private static int ReadInt(JsonElement item, string name, int fallback)
    {
        return item.TryGetProperty(name, out JsonElement value) && value.TryGetInt32(out int parsed) ? parsed : fallback;
    }

    private static double ReadDouble(JsonElement item, string name, double fallback)
    {
        return item.TryGetProperty(name, out JsonElement value) && value.TryGetDouble(out double parsed) ? parsed : fallback;
    }

    private static string DisplayTag(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? "n/a" : value.Trim().ToLowerInvariant();
    }

    private static string FormatBytes(double bytes)
    {
        if (double.IsNaN(bytes)) return "n/a";
        return $"{bytes / 1024 / 1024:0.00} MB";
    }

    private static string ImpactBrushFor(double bytes)
    {
        double mb = bytes / 1024 / 1024;
        if (mb >= 100) return "#7A2525";
        if (mb >= 30) return "#6B4A16";
        if (mb > 0) return "#24523A";
        return "#30343A";
    }

    private static string SourceBrushFor(string value)
    {
        return value.ToLowerInvariant() switch
        {
            "measured" => "#24523A",
            "cached" => "#1F4F73",
            _ => "#30343A"
        };
    }

    private static string ModeBrushFor(string value)
    {
        return value.ToLowerInvariant() switch
        {
            "headless" => "#314A6E",
            "offscreen" => "#6B4A16",
            "visible" => "#5B3C66",
            _ => "#30343A"
        };
    }

    private static string ConfidenceBrushFor(string value)
    {
        return value.ToLowerInvariant() switch
        {
            "high" => "#24523A",
            "medium" => "#314A6E",
            "low" => "#6B4A16",
            _ => "#30343A"
        };
    }
}
