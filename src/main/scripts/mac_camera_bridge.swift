import Foundation
import ImageCaptureCore

// mac_camera_bridge.swift
// Enterprise Apple ImageCaptureCore camera bridge for FotoSync PRO
// Supports Nikon, Sony (PC Remote/MTP), Canon, Fuji, Lumix, and all USB PTP cameras on macOS.

@objc class CameraBridge: NSObject, ICDeviceBrowserDelegate, ICCameraDeviceDelegate, ICCameraDeviceDownloadDelegate {
    let browser = ICDeviceBrowser()
    let destinationURL: URL
    var connectedCameras = [String: ICCameraDevice]()
    var downloadedFiles = Set<String>()

    init(targetDir: String) {
        self.destinationURL = URL(fileURLWithPath: targetDir)
        super.init()
        
        try? FileManager.default.createDirectory(at: self.destinationURL, withIntermediateDirectories: true, attributes: nil)
        
        browser.delegate = self
        browser.browsedDeviceTypeMask = .camera
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

    // --- ICCameraDeviceDelegate ---
    func deviceDidBecomeReady(_ device: ICDevice) {
        guard let camera = device as? ICCameraDevice else { return }
        let camName = camera.name ?? "Kamera USB"
        
        sendJson([
            "event": "camera_ready",
            "camera": camName,
            "totalItems": camera.mediaFiles?.count ?? 0
        ])
        
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

    func processCameraFiles(_ files: [ICCameraFile], camera: ICCameraDevice) {
        for file in files {
            let filename = file.name ?? "photo.jpg"
            let ext = (filename as NSString).pathExtension.lowercased()
            
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
        let options: [ICDownloadOption: Any] = [
            .targetDirectory: destinationURL,
            .saveAsFilename: filename,
            .overwrite: true
        ]

        camera.requestDownloadFile(file, options: options, downloadDelegate: self, didDownloadFileSelector: #selector(didDownloadFile(_:error:options:contextInfo:)), contextInfo: nil)
    }

    // --- ICCameraDeviceDownloadDelegate ---
    @objc func didDownloadFile(_ file: ICCameraFile, error: Error?, options: [String: Any], contextInfo: UnsafeMutableRawPointer?) {
        let filename = file.name ?? "photo.jpg"
        let finalPath = destinationURL.appendingPathComponent(filename).path
        if let error = error {
            sendJson([
                "event": "download_failed",
                "file": filename,
                "error": error.localizedDescription
            ])
        } else {
            sendJson([
                "event": "photo_downloaded",
                "file": filename,
                "path": finalPath,
                "camera": file.device?.name ?? "USB Camera"
            ])
        }
    }
}

// Entry Point
let args = CommandLine.arguments
let targetDir = args.count > 1 ? args[1] : (FileManager.default.urls(for: .picturesDirectory, in: .userDomainMask).first?.path ?? "/tmp")

let bridge = CameraBridge(targetDir: targetDir)

RunLoop.current.run()
