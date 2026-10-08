#import "JsSandboxRunner.h"

#include "JsSandbox.h"

#include <string>

namespace {

std::string toUtf8(NSString *value) {
  const char *bytes = value.UTF8String;
  return bytes ? std::string(bytes) : std::string();
}

} // namespace

@implementation JsSandboxRunner

+ (NSString *)runWithId:(NSString *)runId
                   code:(NSString *)code
              storeJson:(NSString *)storeJson
              timeoutMs:(uint32_t)timeoutMs
            memoryBytes:(uint32_t)memoryBytes
         maxResultBytes:(uint32_t)maxResultBytes
            maxLogBytes:(uint32_t)maxLogBytes
{
  const cherry::jssandbox::Limits limits{
      timeoutMs, memoryBytes, maxResultBytes, maxLogBytes};
  const std::string result =
      cherry::jssandbox::run(toUtf8(runId), toUtf8(code), toUtf8(storeJson), limits);
  return [[NSString alloc] initWithBytes:result.data()
                                  length:result.size()
                                encoding:NSUTF8StringEncoding]
      ?: @"{\"status\":\"error\",\"kind\":\"internal\",\"message\":\"The sandbox returned invalid text.\"}";
}

+ (void)cancelWithId:(NSString *)runId
{
  cherry::jssandbox::cancel(toUtf8(runId));
}

@end
