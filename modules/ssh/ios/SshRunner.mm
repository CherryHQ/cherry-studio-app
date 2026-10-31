#import "SshRunner.h"
#include "Ssh.h"
#include <utility>
@implementation SshRunner
+ (BOOL)prepare:(NSString *)runId { return cherry::ssh::prepare(runId.UTF8String); }
+ (void)cancel:(NSString *)runId { cherry::ssh::cancel(runId.UTF8String); }
+ (void)cancelAll { cherry::ssh::cancelAll(); }
+ (NSString *)run:(NSString *)runId strings:(NSArray<NSString *> *)strings port:(int)port
         timeout:(int)timeout probe:(BOOL)probe
          output:(void (^)(NSString *, NSString *))output {
  cherry::ssh::Options options;
  options.host = strings[0].UTF8String;
  options.username = strings[1].UTF8String;
  options.fingerprint = strings[2].UTF8String;
  options.password = strings[3].UTF8String;
  options.privateKey = strings[4].UTF8String;
  options.passphrase = strings[5].UTF8String;
  options.command = strings[6].UTF8String;
  options.port = port;
  options.timeoutMs = timeout;
  options.probe = probe;
  auto result = cherry::ssh::run(runId.UTF8String, std::move(options), [&](const auto &stream, const auto &data) {
    output([NSString stringWithUTF8String:stream.c_str()], [NSString stringWithUTF8String:data.c_str()]);
  });
  return [NSString stringWithUTF8String:result.c_str()];
}
@end
