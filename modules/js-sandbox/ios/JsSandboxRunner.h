#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Objective-C face of the shared C++ sandbox core, which Swift cannot call.
@interface JsSandboxRunner : NSObject

/// Blocks the calling thread until the script settles; returns the outcome JSON.
+ (NSString *)runWithId:(NSString *)runId
                   code:(NSString *)code
              timeoutMs:(uint32_t)timeoutMs
          softHeapBytes:(uint32_t)softHeapBytes
          hardHeapBytes:(uint32_t)hardHeapBytes
         maxResultBytes:(uint32_t)maxResultBytes
            maxLogBytes:(uint32_t)maxLogBytes
    NS_SWIFT_NAME(run(id:code:timeoutMs:softHeapBytes:hardHeapBytes:maxResultBytes:maxLogBytes:));

+ (void)cancelWithId:(NSString *)runId NS_SWIFT_NAME(cancel(id:));

@end

NS_ASSUME_NONNULL_END
