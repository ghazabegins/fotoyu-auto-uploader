#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>

// mac_camera_bridge.m
// Enterprise Apple ImageCaptureCore camera bridge for FotoSync PRO
// Native Objective-C / ARC engine for ultra-fast, zero-overhead camera detection and live shutter download.

@interface CameraBridge : NSObject <ICDeviceBrowserDelegate, ICCameraDeviceDelegate>
@property (nonatomic, strong) ICDeviceBrowser *browser;
@property (nonatomic, strong) NSString *destinationPath;
@property (nonatomic, strong) NSMutableSet<NSString *> *downloadedFiles;
@property (nonatomic, strong) NSMutableDictionary<NSString *, ICCameraDevice *> *connectedCameras;
@end

@implementation CameraBridge

- (instancetype)initWithTargetDir:(NSString *)targetDir {
    self = [super init];
    if (self) {
        self.destinationPath = targetDir;
        self.downloadedFiles = [NSMutableSet set];
        self.connectedCameras = [NSMutableDictionary dictionary];

        // Ensure target directory exists
        [[NSFileManager defaultManager] createDirectoryAtPath:self.destinationPath
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];

        self.browser = [[ICDeviceBrowser alloc] init];
        self.browser.delegate = self;
        self.browser.browsedDeviceTypeMask = ICDeviceTypeMaskCamera;
        self.browser.browsedDeviceLocationTypeMask = ICDeviceLocationTypeMaskLocal | ICDeviceLocationTypeMaskShared | ICDeviceLocationTypeMaskBonjour;
        [self.browser start];

        [self sendJSON:@{
            @"event": @"bridge_ready",
            @"targetDir": targetDir,
            @"platform": @"macOS"
        }];
    }
    return self;
}

- (void)sendJSON:(NSDictionary *)dict {
    NSError *err = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:dict options:0 error:&err];
    if (data) {
        NSString *str = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        printf("%s\n", [str UTF8String]);
        fflush(stdout);
    }
}

#pragma mark - ICDeviceBrowserDelegate

- (void)deviceBrowser:(ICDeviceBrowser *)browser didAddDevice:(ICDevice *)device moreComing:(BOOL)moreComing {
    if ([device isKindOfClass:[ICCameraDevice class]]) {
        ICCameraDevice *camera = (ICCameraDevice *)device;
        NSString *camName = camera.name ?: @"Kamera USB";
        NSString *camId = [NSString stringWithFormat:@"%@_%lu", camName, (unsigned long)camera.hash];
        self.connectedCameras[camId] = camera;
        camera.delegate = self;

        [self sendJSON:@{
            @"event": @"camera_connected",
            @"camera": camName,
            @"mediaFilesCount": @(camera.mediaFiles.count)
        }];

        [camera requestOpenSession];
    }
}

- (void)deviceBrowser:(ICDeviceBrowser *)browser didRemoveDevice:(ICDevice *)device moreGoing:(BOOL)moreGoing {
    if ([device isKindOfClass:[ICCameraDevice class]]) {
        ICCameraDevice *camera = (ICCameraDevice *)device;
        NSString *camName = camera.name ?: @"Kamera USB";
        NSString *camId = [NSString stringWithFormat:@"%@_%lu", camName, (unsigned long)camera.hash];
        [self.connectedCameras removeObjectForKey:camId];

        [self sendJSON:@{
            @"event": @"camera_disconnected",
            @"camera": camName
        }];
    }
}

#pragma mark - ICCameraDeviceDelegate

- (void)deviceDidBecomeReady:(ICDevice *)device {
    if ([device isKindOfClass:[ICCameraDevice class]]) {
        ICCameraDevice *camera = (ICCameraDevice *)device;
        NSString *camName = camera.name ?: @"Kamera USB";

        [self sendJSON:@{
            @"event": @"camera_ready",
            @"camera": camName,
            @"totalItems": @(camera.mediaFiles.count)
        }];

        [camera requestEnableTethering];
        [camera requestCapabilities];
        [self processCameraFiles:camera.mediaFiles forCamera:camera];
    }
}

- (void)device:(ICDevice *)device didOpenSessionWithError:(NSError *)error {
    if ([device isKindOfClass:[ICCameraDevice class]]) {
        ICCameraDevice *camera = (ICCameraDevice *)device;
        NSString *camName = camera.name ?: @"Kamera USB";

        if (error) {
            [self sendJSON:@{
                @"event": @"session_error",
                @"camera": camName,
                @"error": error.localizedDescription ?: @"Unknown session error"
            }];
            return;
        }

        [self sendJSON:@{
            @"event": @"session_opened",
            @"camera": camName
        }];

        [camera requestEnableTethering];
        [camera requestCapabilities];
        [self processCameraFiles:camera.mediaFiles forCamera:camera];
    }
}

- (void)device:(ICDevice *)device didCloseSessionWithError:(NSError *)error {
    NSString *camName = device.name ?: @"Kamera USB";
    [self sendJSON:@{
        @"event": @"session_closed",
        @"camera": camName
    }];
}

- (void)cameraDevice:(ICCameraDevice *)camera didAddItems:(NSArray<ICCameraItem *> *)items {
    [self processCameraFiles:items forCamera:camera];
}

- (void)processCameraFiles:(NSArray *)items forCamera:(ICCameraDevice *)camera {
    for (id item in items) {
        if (![item isKindOfClass:[ICCameraFile class]]) continue;
        ICCameraFile *file = (ICCameraFile *)item;
        NSString *filename = file.name ?: @"photo.jpg";
        NSString *ext = [filename pathExtension].lowercaseString;

        // Only process JPG, JPEG, PNG for high-speed live ingest
        if (![ext isEqualToString:@"jpg"] && ![ext isEqualToString:@"jpeg"] && ![ext isEqualToString:@"png"]) {
            continue;
        }

        NSString *destFile = [self.destinationPath stringByAppendingPathComponent:filename];
        if ([[NSFileManager defaultManager] fileExistsAtPath:destFile] || [self.downloadedFiles containsObject:filename]) {
            continue;
        }

        [self.downloadedFiles addObject:filename];
        [self downloadFile:file fromCamera:camera];
    }
}

- (void)downloadFile:(ICCameraFile *)file fromCamera:(ICCameraDevice *)camera {
    NSString *filename = file.name ?: [NSString stringWithFormat:@"IMG_%ld.jpg", (long)[[NSDate date] timeIntervalSince1970]];
    NSString *camName = camera.name ?: @"Kamera USB";
    NSString *finalDest = [self.destinationPath stringByAppendingPathComponent:filename];

    NSDictionary *options = @{
        @"ICDownloadsDirectoryURL": [NSURL fileURLWithPath:self.destinationPath],
        @"ICSaveAsFilename": filename,
        @"ICOverwrite": @YES
    };

    [camera requestDownloadFile:file
                        options:options
               downloadDelegate:self
                     completion:^(NSError * _Nullable error, NSString * _Nullable savedPath) {
        if (error) {
            [self sendJSON:@{
                @"event": @"download_failed",
                @"file": filename,
                @"error": error.localizedDescription ?: @"Download error"
            }];
        } else {
            NSString *resultPath = (savedPath && savedPath.length > 0) ? savedPath : finalDest;
            [self sendJSON:@{
                @"event": @"photo_downloaded",
                @"file": filename,
                @"path": resultPath,
                @"camera": camName
            }];
        }
    }];
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSString *targetDir = @"/tmp";
        if (argc > 1) {
            targetDir = [NSString stringWithUTF8String:argv[1]];
        } else {
            NSArray *paths = NSSearchPathForDirectoriesInDomains(NSPicturesDirectory, NSUserDomainMask, YES);
            targetDir = paths.firstObject ?: @"/tmp";
        }

        CameraBridge *bridge = [[CameraBridge alloc] initWithTargetDir:targetDir];
        (void)bridge;

        [[NSRunLoop currentRunLoop] run];
    }
    return 0;
}
