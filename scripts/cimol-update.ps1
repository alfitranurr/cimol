<#
.SYNOPSIS
    Cek dan pasang update Cimol dari GitHub Releases.

.DESCRIPTION
    Membandingkan versi Cimol yang terpasang dengan rilis terbaru di github.com/alfitranurr/cimol.
    Kalau ada versi baru, muncul notifikasi Windows. Dengan -Install, installer diunduh,
    di-cek SHA-512-nya, lalu dipasang tanpa jendela (silent) dan Cimol dibuka lagi.

.EXAMPLE
    .\cimol-update.ps1
    Cek update. Kalau ada versi baru, ditanya apakah mau dipasang.

.EXAMPLE
    .\cimol-update.ps1 -Install
    Langsung pasang kalau ada versi baru.

.EXAMPLE
    .\cimol-update.ps1 -RegisterTask
    Daftarkan pengecekan otomatis setiap hari (Task Scheduler). Hapus lagi dengan -UnregisterTask.
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Quiet,
    [switch]$RegisterTask,
    [switch]$UnregisterTask,
    [string]$At = '09:00',
    [string]$Repo = 'alfitranurr/cimol'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$TaskName = 'Cimol Update Check'
$AppId = 'com.alfitranurr.cimol'
$PowerShellAppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
$Headers = @{ 'User-Agent' = 'cimol-update'; 'Accept' = 'application/vnd.github+json' }

function Write-Info([string]$Message, [string]$Color = 'Gray') {
    if (-not $Quiet) { Write-Host $Message -ForegroundColor $Color }
}

function Show-Toast([string]$Title, [string]$Body, [bool]$UseCimolId) {
    try {
        $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
        $t = [Security.SecurityElement]::Escape($Title)
        $b = [Security.SecurityElement]::Escape($Body)
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$t</text><text>$b</text></binding></visual></toast>")
        # Pakai identitas Cimol kalau terpasang, supaya klik notifikasi membuka Cimol.
        $id = if ($UseCimolId) { $AppId } else { $PowerShellAppId }
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show((New-Object Windows.UI.Notifications.ToastNotification $xml))
    } catch {
        Write-Info "(Notifikasi Windows tidak bisa ditampilkan: $($_.Exception.Message))" 'DarkGray'
    }
}

function Get-Installed {
    $entry = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        Get-ItemProperty -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'Cimol*' } |
        Select-Object -First 1

    $dir = if ($entry -and $entry.InstallLocation) { $entry.InstallLocation } else { Join-Path $env:LOCALAPPDATA 'Programs\cimol' }
    $exe = Join-Path $dir 'Cimol.exe'

    $version = $null
    if ($entry -and $entry.DisplayVersion) { $version = $entry.DisplayVersion }
    elseif (Test-Path $exe) { $version = (Get-Item $exe).VersionInfo.ProductVersion }
    if (-not $version) { return $null }

    [pscustomobject]@{ Version = [version]($version -replace '[^\d.].*$', ''); Exe = $exe }
}

function Get-Sha512Base64([string]$Path) {
    $sha = [Security.Cryptography.SHA512]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { [Convert]::ToBase64String($sha.ComputeHash($stream)) } finally { $stream.Dispose(); $sha.Dispose() }
}

# ---------- Task Scheduler ----------

if ($UnregisterTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Info "Jadwal '$TaskName' dihapus." 'Green'
    return
}

if ($RegisterTask) {
    $script = $PSCommandPath
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Quiet"
    $trigger = New-ScheduledTaskTrigger -Daily -At $At
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'Cek update Cimol dari GitHub Releases setiap hari.' -Force | Out-Null
    Write-Info "Terjadwal: cek update Cimol setiap hari pukul $At (dan saat laptop menyala kalau terlewat)." 'Green'
    Write-Info "Skrip: $script" 'DarkGray'
    return
}

# ---------- Cek versi ----------

$installed = Get-Installed
$current = if ($installed) { $installed.Version } else { $null }

try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $Headers
} catch {
    Write-Info "Gagal menghubungi GitHub: $($_.Exception.Message)" 'Red'
    exit 2
}

$latest = [version]($release.tag_name.TrimStart('v') -replace '[^\d.].*$', '')
$setupAsset = $release.assets | Where-Object { $_.name -like 'CimolSetup-*.exe' } | Select-Object -First 1
$ymlAsset = $release.assets | Where-Object { $_.name -eq 'latest.yml' } | Select-Object -First 1

if ($current) { Write-Info "Terpasang : v$current" } else { Write-Info 'Terpasang : (Cimol belum terpasang)' }
Write-Info "Terbaru   : v$latest  ($($release.html_url))"

if ($current -and $current -ge $latest) {
    Write-Info 'Cimol sudah versi terbaru.' 'Green'
    exit 0
}

if (-not $setupAsset) {
    Write-Info "Rilis v$latest belum punya installer." 'Yellow'
    exit 3
}

Write-Info "Update tersedia: v$latest" 'Cyan'

if (-not $Install) {
    if ($Quiet) {
        Show-Toast "Cimol v$latest tersedia" 'Buka Cimol untuk memasang, atau jalankan cimol-update.ps1 -Install.' ([bool]$installed)
        exit 10
    }
    $answer = Read-Host 'Pasang sekarang? (Y/N)'
    if ($answer -notmatch '^(y|ya|yes)$') {
        Write-Info 'Dibatalkan.'
        exit 10
    }
}

# ---------- Unduh & pasang ----------

$tmp = Join-Path $env:TEMP "cimol-update-$latest"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$setup = Join-Path $tmp $setupAsset.name

Write-Info "Mengunduh $($setupAsset.name) ($([math]::Round($setupAsset.size / 1MB, 1)) MB)..."
Invoke-WebRequest -Uri $setupAsset.browser_download_url -OutFile $setup -UseBasicParsing -Headers @{ 'User-Agent' = 'cimol-update' }

if ($ymlAsset) {
    $ymlPath = Join-Path $tmp 'latest.yml'
    Invoke-WebRequest -Uri $ymlAsset.browser_download_url -OutFile $ymlPath -UseBasicParsing -Headers @{ 'User-Agent' = 'cimol-update' }
    $expected = ([regex]::Match((Get-Content $ymlPath -Raw), '(?m)^sha512:\s*(\S+)')).Groups[1].Value
    $actual = Get-Sha512Base64 $setup
    if (-not $expected -or $expected -ne $actual) {
        Remove-Item $setup -Force
        Write-Info 'SHA-512 installer tidak cocok dengan latest.yml. Update dibatalkan.' 'Red'
        exit 4
    }
    Write-Info 'SHA-512 cocok.' 'Green'
} else {
    Write-Info 'latest.yml tidak ada di rilis, SHA-512 tidak bisa dicek.' 'Yellow'
}

Get-Process -Name 'Cimol' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

Write-Info 'Memasang...'
$proc = Start-Process -FilePath $setup -ArgumentList '/S' -PassThru -Wait
if ($proc.ExitCode -ne 0) {
    Write-Info "Installer selesai dengan kode $($proc.ExitCode)." 'Red'
    exit 5
}

$after = Get-Installed
if ($after -and (Test-Path $after.Exe)) { Start-Process $after.Exe }
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Info "Cimol v$latest terpasang." 'Green'
Show-Toast "Cimol diperbarui ke v$latest" 'Update berhasil dipasang.' $true
exit 0
