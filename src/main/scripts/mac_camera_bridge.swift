import Foundation
import ImageCaptureCore

// mac_camera_bridge.swift
// Enterprise Apple ImageCaptureCore camera bridge for FotoSync PRO
// Supports Nikon, Sony (PC Remote/MTP), Canon, Fuji, Lumix, and all USB PTP cameras on macOS.

class CameraBridge: NSObject, ICDeviceBrowserDelegate, ICCameraDeviceDelegate, ICCameraDeviceDownloadDelegate {
    let browser = ICDeviceBrowser()
    let destinationURL: URL
    var connectedCameras = [String: ICCameraDevice]()
    var downloadedFiles = Set<String>()

    init(targetDir: String) {
        self.destinationURL = URL(fileURLWithPath: targetDir)
        super.init()
        
        // Ensure destination directory exists
        try? FileManager.default.createDirectory(at: self.destinationURL, withIntermediateDirectories: true, attributes: nil)
        
        browser.delegate = self
        
        // Listen to all local, shared, and Bonjour cameras
        let mask = ICDeviceTypeMask(rawValue: 
            ICDeviceTypeMask.camera.rawValue |
            ICDeviceLocationTypeMask.local.rawValue |
            ICDeviceLocationTypeMask.shared.rawValue |
            ICDeviceLocationTypeMask.bonjour.rawValue |
            ICDeviceLocationTypeMask.bluetooth.rawValue
        ) ?? .camera
        
        browser.browsedDeviceTypeMask = mask
        browser.start()
        
        sendJson(["event": "bridge_ready", "targetDir": targetDir, "platform": "macOS"])
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
        
        let camName = camera.name ?? "Kamera USB"
        let camId = "\(camName)_\(camera.hashValue)"
        connectedCameras[camId] = camera
        
        camera.delegate = self
        
        sendJson([
            "event": "camera_connected",
            "camera": camName,
            "mediaFilesCount": camera.mediaFiles?.count ?? 0
        ])
        
        // Request opening session with camera device
        camera.requestOpenSession()
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        guard let camera = device as? ICCameraDevice else { return }
        let camName = camera.name ?? "Kamera USB"
        let camId = "\(camName)_\(camera.hashValue)"
        connectedCameras.removeValue(forKey: camId)
        
        sendJson([
            "event": "camera_disconnected",
            "camera": camName
        ])
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, deviceDidChangeName device: ICDevice) {
        // Device name updated
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, deviceDidChangeSharingState device: ICDevice) {
        // Sharing state updated
    }

    // --- ICCameraDeviceDelegate ---
    func deviceDidBecomeReady(_ device: ICDevice) {
        guard let camera = device as? ICCameraDevice else { return }
        let camName = camera.name ?? "Kamera USB"
        
        sendJson([
            "event": "camera_ready",
            "camera": camName,
            "totalItems": camera.mediaFiles?.count ?? 0
        ])
        
        // Enable tethering for Live Shutter shooting if supported by firmware
        camera.requestEnableTethering()
        camera.requestCapabilities()
        
        if let files = camera.mediaFiles as? [ICCameraFile] {
            processCameraFiles(files, camera: camera)
        }
    }

    func cameraDevice(_ camera: ICCameraDevice, didOpenSessionWithError error: Error?) {
        let camName = camera.name ?? "Kamera USB"
        if let error = error {
            sendJson([
                "event": "session_error",
                "camera": camName,
                "error": error.localizedDescription
            ])
            return
        }
        
        sendJson([
            "event": "session_opened",
            "camera": camName
        ])
        
        // Enable Live Shutter tethering mode
        camera.requestEnableTethering()
        camera.requestCapabilities()
        
        if let files = camera.mediaFiles as? [ICCameraFile] {
            processCameraFiles(files, camera: camera)
        }
    }

    func cameraDevice(_ camera: ICCameraDevice, didCloseSessionWithError error: Error?) {
        let camName = camera.name ?? "Kamera USB"
        sendJson([
            "event": "session_closed",
            "camera": camName
        ])
    }

    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
        let cameraFiles = items.compactMap { $0 as? ICCameraFile }
        processCameraFiles(cameraFiles, camera: camera)
    }

    func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {
        // Items deleted from camera
    }

    func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {
        // Thumbnail received
    }

    func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: Error?) {
        // Metadata received
    }

    func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {
        // Capability updated
    }

    // --- File Processing & Ingest ---
    func processCameraFiles(_ files: [ICCameraFile], camera: ICCameraDevice) {
        for file in files {
            let filename = file.name ?? "photo.jpg"
            let ext = (filename as NSString).pathExtension.lowercased()
            
            // Only process JPEG/JPG/PNG images for fast live shutter ingest
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
        let filename = file.name ?? "IMG_\(Int(Date().timeIntervalSince1970)).jpg"
        let camName = camera.name ?? "USB Camera"
        
        let options: [ICDownloadOption: Any] = [
            .targetDirectory: destinationURL,
            .saveAsFilename: filename,
            .overwrite: true
        ]

        camera.requestDownloadFile(file, options: options, downloadDelegate: self) { error, savedPath in
            if let error = error {
                self.sendJson([
                    "event": "download_failed",
                    "file": filename,
                    "error": error.localizedDescription
                ])
            } else {
                let finalPath = (savedPath != nil && !savedPath!.isEmpty) ? savedPath! : self.destinationURL.appendingPathComponent(filename).path
                self.sendJson([
                    "event": "photo_downloaded",
                    "file": filename,
                    "path": finalPath,
                    "camera": camName
                ])
            }
        }
    }

    // --- ICCameraDeviceDownloadDelegate ---
    func didDownloadFile(_ file: ICCameraFile, error: Error?, options: [String: Any], contextInfo: UnsafeMutableRawPointer?) {
        let filename = file.name ?? "photo.jpg"
        let finalPath = destinationURL.appendingPathComponent(filename).path
        if error == nil && FileManager.default.fileExists(atPath: finalPath) {
            sendJson([
                "event": "photo_downloaded",
                "file": filename,
                "path": finalPath,
                "camera": "USB Camera"
            ])
        }
    }
}

// Entry Point
let args = CommandLine.arguments
let targetDir = args.count > 1 ? args[1] : (FileManager.default.urls(for: .picturesDirectory, in: .userDomainMask).first?.path ?? "/tmp")

let bridge = CameraBridge(targetDir: targetDir)

// Spin RunLoop to listen for device connection and shutter events
RunLoop.current.run()
