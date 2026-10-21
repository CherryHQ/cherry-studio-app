#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Objective-C face of the shared C++ sandbox core, which Swift cannot call.
@interface JsSandboxRunner : NSObject

/// Blocks the calling thread until the script settles; returns the outcome JSON.
+ (NSString *)runWithId:(NSString *)runId
                   code:(NSString *)code
              timeoutMs:(uint32_t)timeoutMs
            memoryBytes:(uint32_t)memoryBytes
         maxResultBytes:(uint32_t)maxResultBytes
            maxLogBytes:(uint32_t)maxLogBytes
    NS_SWIFT_NAME(run(id:code:timeoutMs:memoryBytes:maxResultBytes:maxLogBytes:));

/// `run` with host-chosen local files exposed as the script's `__files`; an
/// empty `outputPath` means the run produces no file.
+ (NSString *)runWithId:(NSString *)runId
                   code:(NSString *)code
             inputPaths:(NSArray<NSString *> *)inputPaths
             outputPath:(NSString *)outputPath
              timeoutMs:(uint32_t)timeoutMs
            memoryBytes:(uint32_t)memoryBytes
         maxResultBytes:(uint32_t)maxResultBytes
            maxLogBytes:(uint32_t)maxLogBytes
    NS_SWIFT_NAME(run(id:code:inputPaths:outputPath:timeoutMs:memoryBytes:maxResultBytes:maxLogBytes:));

+ (void)cancelWithId:(NSString *)runId NS_SWIFT_NAME(cancel(id:));

+ (NSString *)runBridgeWithId:(NSString *)runId
                       setup:(NSString *)setup
                        data:(NSString *)data
                   startedAt:(double)startedAt
                        seed:(uint32_t)seed
                   timeoutMs:(uint32_t)timeoutMs
                 memoryBytes:(uint32_t)memoryBytes
                        post:(void (^)(NSString *message))post
    NS_SWIFT_NAME(runBridge(id:setup:data:startedAt:seed:timeoutMs:memoryBytes:post:));

+ (void)deliverWithId:(NSString *)runId message:(NSString *)message
    NS_SWIFT_NAME(deliver(id:message:));

@end

NS_ASSUME_NONNULL_END
