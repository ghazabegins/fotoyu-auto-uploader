# scan_mtp_camera.ps1 - Scan & Sync MTP/WPD Cameras (Canon, Sony, Nikon, Fuji, etc.)
param (
    [string]$Action = "scan",
    [string]$TargetDir = "",
    [string]$KnownFilesPath = ""
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
        $itemPath = $item.Path
        # Exclude drive letters (e.g. "E:\" or "C:\"), which are Mass Storage / SD Cards, not MTP cameras!
        if ($itemPath -match '^[A-Za-z]:\\?$') {
            continue
        }

        foreach ($wpdName in $wpdDevices) {
            if ($itemName -eq $wpdName -or $itemName -like "*$wpdName*" -or $wpdName -like "*$itemName*") {
                $cameraItem = $item
                break
            }
        }
        if ($cameraItem) { break }
    }

    if (-not $cameraItem) {
        # Fallback: check items matching camera brand words with word boundaries (excluding drive letters)
        foreach ($item in $myComputer.Items()) {
            $name = $item.Name
            $itemPath = $item.Path
            if ($itemPath -match '^[A-Za-z]:\\?$') {
                continue
            }
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

        $knownSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        if ($KnownFilesPath -and (Test-Path $KnownFilesPath)) {
            try {
                Get-Content $KnownFilesPath -ErrorAction SilentlyContinue | ForEach-Object {
                    $fn = $_.Trim()
                    if ($fn) { [void]$knownSet.Add($fn) }
                }
            } catch {}
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
                        $itemName = $item.Name
                        # Skip if already synced from this camera previously
                        if (-not $knownSet.Contains($itemName)) {
                            $destPath = Join-Path $TargetDir $itemName
                            if (-not (Test-Path $destPath)) {
                                $targetFolderObj = $shell.NameSpace($TargetDir)
                                if ($targetFolderObj) {
                                    $targetFolderObj.CopyHere($item, 16 + 4)
                                    $global:copiedCount++
                                    $global:copiedFiles += $itemName
                                    [void]$knownSet.Add($itemName)
                                    if ($KnownFilesPath) {
                                        Add-Content -Path $KnownFilesPath -Value $itemName -ErrorAction SilentlyContinue
                                    }
                                }
                            } else {
                                # File already exists in TargetDir, record it in knownSet to prevent re-copying to other folders
                                [void]$knownSet.Add($itemName)
                                if ($KnownFilesPath) {
                                    Add-Content -Path $KnownFilesPath -Value $itemName -ErrorAction SilentlyContinue
                                }
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
