import Foundation
import ImageCaptureCore

// mac_camera_bridge.swift
// Native Apple ImageCaptureCore camera watcher for FotoSync PRO
// Detects Sony, Nikon, Canon, Fuji, and other PTP/MTP cameras connected via USB on macOS.

class CameraBridge: NSObject, ICDeviceBrowserDelegate, ICCameraDeviceDelegate, ICCameraDeviceDownloadDelegate {
    let browser = ICDeviceBrowser()
    let destinationURL: URL
    var connectedCameras = [String: ICCameraDevice]()
    var downloadedFiles = Set<String>()

    init(targetDir: String) {
        self.destinationURL = URL(fileURLWithPath: targetDir)
        super.init()
        
        // Ensure destination folder exists
        try? FileManager.default.createDirectory(at: self.destinationURL, withIntermediateDirectories: true, attributes: nil)
        
        browser.delegate = self
        browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: 
            ICDeviceTypeMask.camera.rawValue | ICDeviceLocationTypeMask.local.rawValue)!
        browser.start()
        
        sendJson(["event": "bridge_ready", "targetDir": targetDir])
    }

    func sendJson(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }

    // --- ICDeviceBrowserDelegate ---
    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        guard let camera = device as? ICCameraDevice else { return }
        
        let camId = camera.name ?? "Camera_\(camera.hashValue)"
        connectedCameras[camId] = camera
        camera.delegate = self
        
        sendJson([
            "event": "camera_connected",
            "camera": camera.name ?? "USB Camera",
            "mediaFilesCount": camera.mediaFiles?.count ?? 0
        ])
        
        camera.requestOpenSession()
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        guard let camera = device as? ICCameraDevice else { return }
        let camId = camera.name ?? "Camera_\(camera.hashValue)"
        connectedCameras.removeValue(forKey: camId)
        
        sendJson([
            "event": "camera_disconnected",
            "camera": camera.name ?? "USB Camera"
        ])
    }

    // --- ICCameraDeviceDelegate ---
    func deviceDidBecomeReady(_ device: ICDevice) {
        guard let camera = device as? ICCameraDevice else { return }
        sendJson([
            "event": "camera_ready",
            "camera": camera.name ?? "USB Camera",
            "totalItems": camera.mediaFiles?.count ?? 0
        ])
        
        // Initial sync of already existing files in camera storage
        if let files = camera.mediaFiles as? [ICCameraFile] {
            processCameraFiles(files, camera: camera)
        }
    }

    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
        let cameraFiles = items.compactMap { $0 as? ICCameraFile }
        processCameraFiles(cameraFiles, camera: camera)
    }

    func processCameraFiles(_ files: [ICCameraFile], camera: ICCameraDevice) {
        for file in files {
            let filename = file.name ?? "photo.jpg"
            let ext = (filename as NSString).pathExtension.lowercased()
            
            // Only process JPEG/PNG images for speed and efficiency; skip heavy RAW files
            guard ext == "jpg" || ext == "jpeg" || ext == "png" else { continue }
            
            let destFile = destinationURL.appendingPathComponent(filename)
            if FileManager.default.fileExists(atPath: destFile.path) || downloadedFiles.contains(filename) {
                continue
            }
            
            downloadedFiles.insert(filename)
            downloadFile(file, camera: camera)
        }
    }

    func downloadFile(_ file: ICCameraFile, camera: ICCameraDevice) {
        let filename = file.name ?? "photo.jpg"
        let options: [ICDownloadOption: Any] = [
            .targetDirectory: destinationURL,
            .saveAsFilename: filename,
            .overwrite: true
        ]

        camera.requestDownloadFile(file, options: options, downloadDelegate: self) { error, path in
            if let error = error {
                self.sendJson([
                    "event": "download_failed",
                    "file": filename,
                    "error": error.localizedDescription
                ])
            } else {
                let savedPath = path.isEmpty ? self.destinationURL.appendingPathComponent(filename).path : path
                self.sendJson([
                    "event": "photo_downloaded",
                    "file": filename,
                    "path": savedPath,
                    "camera": camera.name ?? "USB Camera"
                ])
            }
        }
    }
}

// Entry Point
let args = CommandLine.arguments
let targetDir = args.count > 1 ? args[1] : (FileManager.default.urls(for: .picturesDirectory, in: .userDomainMask).first?.path ?? "/tmp")

let bridge = CameraBridge(targetDir: targetDir)

// Run the runloop to keep listening to USB camera PnP events
RunLoop.current.run()
