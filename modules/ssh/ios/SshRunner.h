#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface SshRunner : NSObject
+ (BOOL)prepare:(NSString *)runId NS_SWIFT_NAME(prepare(_:));
+ (void)cancel:(NSString *)runId NS_SWIFT_NAME(cancel(_:));
+ (void)cancelAll;
+ (NSString *)run:(NSString *)runId strings:(NSArray<NSString *> *)strings port:(int)port
         timeout:(int)timeout probe:(BOOL)probe
          output:(void (^)(NSString *stream, NSString *base64))output
    NS_SWIFT_NAME(run(_:strings:port:timeout:probe:output:));
@end
NS_ASSUME_NONNULL_END
