#import "SshRunner.h"
#include "Ssh.h"
#include <utility>
@implementation SshRunner
+ (BOOL)prepare:(NSString *)runId { return cherry::ssh::prepare(runId.UTF8String); }
+ (void)cancel:(NSString *)runId { cherry::ssh::cancel(runId.UTF8String); }
+ (void)cancelAll { cherry::ssh::cancelAll(); }
+ (void)respond:(NSString *)runId challenge:(NSString *)challenge responses:(NSArray<NSString *> *)responses {
  std::vector<std::string> values;
  for (NSString *value in responses) values.emplace_back(value.UTF8String);
  cherry::ssh::respond(runId.UTF8String, challenge.UTF8String, values);
}
+ (void)closePool:(NSString *)key { cherry::ssh::closePool(key.UTF8String); }
+ (void)closeAll { cherry::ssh::closeAll(); }
+ (int)maintain { return cherry::ssh::maintain(); }
+ (NSString *)run:(NSString *)runId strings:(NSArray<NSString *> *)strings port:(int)port
         timeout:(int)timeout probe:(BOOL)probe overwrite:(BOOL)overwrite
          output:(void (^)(NSString *, NSString *))output {
  cherry::ssh::Options options;
  options.host = strings[0].UTF8String;
  options.username = strings[1].UTF8String;
  options.fingerprint = strings[2].UTF8String;
  options.password = strings[3].UTF8String;
  options.privateKey = strings[4].UTF8String;
  options.passphrase = strings[5].UTF8String;
  options.command = strings[6].UTF8String;
  options.cwd = strings[7].UTF8String;
  options.input = strings[8].UTF8String;
  options.directory = strings[9].UTF8String;
  options.poolKey = strings[10].UTF8String;
  options.operation = strings[11].UTF8String;
  options.path = strings[12].UTF8String;
  options.localPath = strings[13].UTF8String;
  options.content = strings[14].UTF8String;
  options.port = port;
  options.timeoutMs = timeout;
  options.probe = probe;
  options.overwrite = overwrite;
  auto result = cherry::ssh::run(runId.UTF8String, std::move(options), [&](const auto &stream, const auto &data) {
    output([NSString stringWithUTF8String:stream.c_str()], [NSString stringWithUTF8String:data.c_str()]);
  });
  return [NSString stringWithUTF8String:result.c_str()];
}
@end
