# Ambil koordinat dari Windows Location Service. Mengembalikan satu baris JSON.
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Device
    $watcher = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::Default)
    $null = $watcher.TryStart($false, [TimeSpan]::FromSeconds(5))
    $deadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $deadline -and ($watcher.Status -ne 'Ready' -or $watcher.Position.Location.IsUnknown)) {
        if ($watcher.Permission -eq 'Denied' -or $watcher.Status -eq 'Disabled') { break }
        Start-Sleep -Milliseconds 300
    }
    $loc = $watcher.Position.Location
    if ($loc.IsUnknown) {
        @{ ok = $false; status = "$($watcher.Status)"; permission = "$($watcher.Permission)" } | ConvertTo-Json -Compress
    } else {
        @{ ok = $true; lat = $loc.Latitude; lon = $loc.Longitude; accuracy = $loc.HorizontalAccuracy } | ConvertTo-Json -Compress
    }
    $watcher.Stop()
} catch {
    @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
