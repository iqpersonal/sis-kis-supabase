# daily_sync.ps1 — DISABLED: Auto-sync removed to reduce Firestore costs.
# Use the dashboard Upload page to trigger manual sync with year selection.
# Previously scheduled via Windows Task Scheduler at 7 PM daily (Arabia Standard Time).
#
# To re-enable: uncomment the lines below and reschedule in Task Scheduler.

Write-Host "daily_sync.ps1 is disabled. Use the dashboard Upload page for manual sync."
exit 0

<# DISABLED — manual sync only

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
<# DISABLED — manual sync only

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile   = Join-Path $scriptDir "daily_sync.log"
$python    = "c:\Users\Admin\Desktop\Project\SiS\.venv\Scripts\python.exe"
$statusScript = Join-Path $scriptDir "write_sync_status.py"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content $logFile "`n========== Daily Sync Started: $timestamp =========="

# Mark daily sync as running
& $python $statusScript --step daily_sync --status running 2>&1 | Out-Null

# Step 1: Sync raw SQL tables to Firestore
Add-Content $logFile "[Step 1] Running live_sync_to_firestore.py ..."
& $python $statusScript --step data_sync --status running 2>&1 | Out-Null
try {
    $output1 = & $python (Join-Path $scriptDir "live_sync_to_firestore.py") --mode quick 2>&1 | Out-String
    Add-Content $logFile $output1
    Add-Content $logFile "[Step 1] live_sync_to_firestore.py completed."
    & $python $statusScript --step data_sync --status success 2>&1 | Out-Null
} catch {
    Add-Content $logFile "[Step 1] ERROR: $($_.Exception.Message)"
    & $python $statusScript --step data_sync --status error --message $_.Exception.Message 2>&1 | Out-Null
}

# Step 2: Regenerate summary/analytics documents
Add-Content $logFile "[Step 2] Running generate_summaries.py ..."
& $python $statusScript --step summaries --status running 2>&1 | Out-Null
try {
    $output2 = & $python (Join-Path $scriptDir "generate_summaries.py") 2>&1 | Out-String
    Add-Content $logFile $output2
    Add-Content $logFile "[Step 2] generate_summaries.py completed."
    & $python $statusScript --step summaries --status success 2>&1 | Out-Null
} catch {
    Add-Content $logFile "[Step 2] ERROR: $($_.Exception.Message)"
    & $python $statusScript --step summaries --status error --message $_.Exception.Message 2>&1 | Out-Null
}

# Step 3: Rebuild browse index for Student Progress page
Add-Content $logFile "[Step 3] Running build_browse_index.py ..."
try {
    $output3 = & $python (Join-Path $scriptDir "build_browse_index.py") 2>&1 | Out-String
    Add-Content $logFile $output3
    Add-Content $logFile "[Step 3] build_browse_index.py completed."
} catch {
    Add-Content $logFile "[Step 3] ERROR: $($_.Exception.Message)"
}

# Mark daily sync complete
& $python $statusScript --step daily_sync --status success 2>&1 | Out-Null

$endTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content $logFile "========== Daily Sync Finished: $endTime =========="

#>
