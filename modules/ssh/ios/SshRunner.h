#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface SshRunner : NSObject
+ (BOOL)prepare:(NSString *)runId NS_SWIFT_NAME(prepare(_:));
+ (void)cancel:(NSString *)runId NS_SWIFT_NAME(cancel(_:));
+ (void)cancelAll;
+ (void)respond:(NSString *)runId challenge:(NSString *)challenge responses:(NSArray<NSString *> *)responses NS_SWIFT_NAME(respond(_:challenge:responses:));
+ (void)closePool:(NSString *)key NS_SWIFT_NAME(closePool(_:));
+ (void)closeAll;
+ (int)maintain;
+ (NSString *)run:(NSString *)runId strings:(NSArray<NSString *> *)strings port:(int)port
         timeout:(int)timeout probe:(BOOL)probe overwrite:(BOOL)overwrite
          output:(void (^)(NSString *stream, NSString *base64))output
    NS_SWIFT_NAME(run(_:strings:port:timeout:probe:overwrite:output:));
@end
NS_ASSUME_NONNULL_END
