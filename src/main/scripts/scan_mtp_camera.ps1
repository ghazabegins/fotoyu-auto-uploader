# scan_mtp_camera.ps1 - Scan & Sync MTP/WPD Cameras (Canon, Sony, Nikon, Fuji, etc.)
param (
    [string]$Action = "scan",
    [string]$TargetDir = ""
)

try {
    # 1. Query connected WPD devices using PnP
    $wpdDevices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Class -eq 'WPD' } | Select-Object -ExpandProperty FriendlyName

    if (-not $wpdDevices) {
        Write-Output '{"success": false, "found": false, "message": "No WPD camera device connected"}'
        exit 0
    }

    $shell = New-Object -ComObject Shell.Application
    $myComputer = $shell.NameSpace(17) # 17 = ssfDRIVES / This PC
    if (-not $myComputer) {
        Write-Output '{"success": false, "found": false, "error": "Cannot open Shell MyComputer"}'
        exit 0
    }

    $cameraItem = $null
    foreach ($item in $myComputer.Items()) {
        $itemName = $item.Name
        foreach ($wpdName in $wpdDevices) {
            if ($itemName -eq $wpdName -or $itemName -like "*$wpdName*" -or $wpdName -like "*$itemName*") {
                $cameraItem = $item
                break
            }
        }
        if ($cameraItem) { break }
    }

    if (-not $cameraItem) {
        # Fallback: check items matching camera brand words with word boundaries
        foreach ($item in $myComputer.Items()) {
            $name = $item.Name
            if ($name -match '\b(NIKON|Canon|Sony|Fujifilm|Fuji|Olympus|Panasonic|Leica|Hasselblad|GoPro)\b') {
                $cameraItem = $item
                break
            }
        }
    }

    if (-not $cameraItem) {
        Write-Output '{"success": false, "found": false, "message": "No MTP Camera Device Found in Shell"}'
        exit 0
    }

    $cameraName = $cameraItem.Name
    $cameraFolder = $cameraItem.GetFolder

    if ($Action -eq "scan") {
        $storageCards = @()
        if ($cameraFolder) {
            foreach ($sub in $cameraFolder.Items()) {
                $storageCards += $sub.Name
            }
        }

        $res = @{
            success = $true
            found = $true
            cameraName = $cameraName
            mode = "MTP_WPD"
            storageCards = $storageCards
        }
        Write-Output ($res | ConvertTo-Json -Compress)
        exit 0
    }

    if ($Action -eq "sync" -and $TargetDir) {
        if (-not (Test-Path $TargetDir)) {
            New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
        }

        $copiedCount = 0
        $copiedFiles = @()

        function SyncMTPFolder($folderObj) {
            if (-not $folderObj) { return }
            foreach ($item in $folderObj.Items()) {
                if ($item.IsFolder) {
                    SyncMTPFolder $item.GetFolder
                } else {
                    $ext = [System.IO.Path]::GetExtension($item.Name).ToLower()
                    if ($ext -match '\.(jpg|jpeg|png|arw|cr2|cr3|nef|raf|dng)$') {
                        $destPath = Join-Path $TargetDir $item.Name
                        if (-not (Test-Path $destPath)) {
                            $targetFolderObj = $shell.NameSpace($TargetDir)
                            if ($targetFolderObj) {
                                $targetFolderObj.CopyHere($item, 16 + 4)
                                $global:copiedCount++
                                $global:copiedFiles += $item.Name
                            }
                        }
                    }
                }
            }
        }

        SyncMTPFolder $cameraFolder

        $res = @{
            success = $true
            found = $true
            copiedCount = $global:copiedCount
            copiedFiles = $global:copiedFiles
            targetDir = $TargetDir
            cameraName = $cameraName
        }
        Write-Output ($res | ConvertTo-Json -Compress)
        exit 0
    }

} catch {
    $errObj = @{
        success = $false
        found = $false
        error = $_.Exception.Message
    }
    Write-Output ($errObj | ConvertTo-Json -Compress)
}
