# Cimol media bridge (Windows PowerShell 5.1).
# Membaca sesi media Windows (GlobalSystemMediaTransportControls) dan mengirim JSON per baris ke stdout.
# Perintah dari stdin (satu per baris): toggle | play | pause | next | prev | seek <detik>
# Juga melaporkan apakah ada aplikasi fullscreen, supaya notch bisa disembunyikan.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function Send($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

Add-Type -Namespace Cimol -Name Shell -MemberDefinition @'
[DllImport("shell32.dll")]
public static extern int SHQueryUserNotificationState(out int state);
'@

function Test-Fullscreen {
    $state = 0
    if ([Cimol.Shell]::SHQueryUserNotificationState([ref]$state) -ne 0) { return $false }
    # 2 = QUNS_BUSY (aplikasi fullscreen), 3 = QUNS_RUNNING_D3D_FULL_SCREEN, 4 = QUNS_PRESENTATION_MODE
    return ($state -eq 2 -or $state -eq 3 -or $state -eq 4)
}

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
} catch {
    Send @{ type = 'error'; message = "WinRT tidak tersedia: $($_.Exception.Message)" }
    exit 1
}

$asTaskOp = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
    Select-Object -First 1

$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

function Await($op, [Type]$resultType) {
    $task = $asTaskOp.MakeGenericMethod($resultType).Invoke($null, @($op))
    if (-not $task.Wait(3000)) { return $null }
    return $task.Result
}

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if ($null -eq $mgr) {
    Send @{ type = 'error'; message = 'Tidak bisa membuka media session manager' }
    exit 1
}

function Get-Art($props) {
    if ($null -eq $props -or $null -eq $props.Thumbnail) { return $null }
    try {
        $ras = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        if ($null -eq $ras) { return $null }
        # PowerShell tidak memproyeksikan tipe stream WinRT ini, jadi panggil lewat reflection.
        $stream = $asStreamForRead.Invoke($null, @($ras))
        $ms = New-Object System.IO.MemoryStream
        $stream.CopyTo($ms)
        $stream.Dispose()
        $bytes = $ms.ToArray()
        if ($bytes.Length -lt 4) { return $null }
        $type = 'image/png'
        if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { $type = 'image/jpeg' }
        return "data:$type;base64," + [Convert]::ToBase64String($bytes)
    } catch {
        return $null
    }
}

function Invoke-MediaCommand([string]$line) {
    $session = $mgr.GetCurrentSession()
    if ($null -eq $session) { return }
    $parts = $line.Trim().Split(' ')
    switch ($parts[0]) {
        'toggle' { $null = Await ($session.TryTogglePlayPauseAsync()) ([bool]) }
        'play'   { $null = Await ($session.TryPlayAsync()) ([bool]) }
        'pause'  { $null = Await ($session.TryPauseAsync()) ([bool]) }
        'next'   { $null = Await ($session.TrySkipNextAsync()) ([bool]) }
        'prev'   { $null = Await ($session.TrySkipPreviousAsync()) ([bool]) }
        'seek'   {
            $seconds = [double]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture)
            $ticks = [long]($seconds * 10000000)
            $null = Await ($session.TryChangePlaybackPositionAsync($ticks)) ([bool])
        }
    }
}

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$readTask = $stdin.ReadLineAsync()
$lastKey = $null
$artRetryAt = $null
$lastArt = $null
$lastFs = $null

while ($true) {
    while ($readTask.IsCompleted) {
        $line = $readTask.Result
        if ($null -eq $line) { exit 0 } # Cimol sudah ditutup
        try { Invoke-MediaCommand $line } catch { }
        $readTask = $stdin.ReadLineAsync()
    }

    try {
        $fs = Test-Fullscreen
        if ($fs -ne $lastFs) {
            Send @{ type = 'fullscreen'; value = $fs }
            $lastFs = $fs
        }
    } catch { }

    try {
        $session = $mgr.GetCurrentSession()
        if ($null -eq $session) {
            if ($lastKey -ne '') { Send @{ type = 'media'; active = $false } }
            $lastKey = ''
        } else {
            $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $playback = $session.GetPlaybackInfo()
            $timeline = $session.GetTimelineProperties()
            $status = $playback.PlaybackStatus.ToString()

            $duration = ($timeline.EndTime - $timeline.StartTime).TotalSeconds
            $position = $timeline.Position.TotalSeconds
            if ($status -eq 'Playing' -and $timeline.LastUpdatedTime.Year -gt 2000) {
                $position += ([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalSeconds
            }
            if ($duration -gt 0 -and $position -gt $duration) { $position = $duration }
            if ($position -lt 0) { $position = 0 }

            $title = ''; $artist = ''; $album = ''
            if ($null -ne $props) { $title = $props.Title; $artist = $props.Artist; $album = $props.AlbumTitle }

            Send @{
                type     = 'media'
                active   = $true
                app      = $session.SourceAppUserModelId
                title    = $title
                artist   = $artist
                album    = $album
                status   = $status
                position = [math]::Round($position, 2)
                duration = [math]::Round($duration, 2)
            }

            # Cover diambil saat lagu berganti, lalu sekali lagi 2 detik kemudian
            # (Spotify kadang masih memberi cover lagu sebelumnya).
            $key = "$title|$artist"
            if ($key -ne $lastKey) {
                $lastKey = $key
                $artRetryAt = (Get-Date).AddSeconds(2)
                $lastArt = Get-Art $props
                Send @{ type = 'art'; key = $key; data = $lastArt }
            } elseif ($null -ne $artRetryAt -and (Get-Date) -ge $artRetryAt) {
                $artRetryAt = $null
                $art = Get-Art $props
                if ($art -ne $lastArt) {
                    $lastArt = $art
                    Send @{ type = 'art'; key = $key; data = $art }
                }
            }
        }
    } catch {
        Send @{ type = 'error'; message = $_.Exception.Message }
    }

    Start-Sleep -Milliseconds 400
}
