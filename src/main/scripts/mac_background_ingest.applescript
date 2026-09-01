-- mac_background_ingest.applescript
-- Automated Background Ingest for FotoSync PRO
-- Silently triggers Image Capture to download new photos from connected camera to target folder
on run argv
    if (count of argv) < 1 then
        return "Error: Missing target directory"
    end if
    
    set targetDirPath to item 1 of argv
    
    try
        set targetFolder to POSIX file targetDirPath as alias
        tell application "Image Capture"
            set devList to devices
            if (count of devList) > 0 then
                repeat with aDevice in devList
                    try
                        download aDevice to targetFolder
                    end try
                end repeat
            end if
        end tell
        return "SUCCESS"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end run
