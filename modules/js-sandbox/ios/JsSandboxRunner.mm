#import "JsSandboxRunner.h"

#include "JsSandbox.h"

#include <string>

namespace {

std::string toUtf8(NSString *value) {
  const char *bytes = value.UTF8String;
  return bytes ? std::string(bytes, [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding]) : std::string();
}

NSString *outcomeText(const std::string &result) {
  return [[NSString alloc] initWithBytes:result.data()
                                  length:result.size()
                                encoding:NSUTF8StringEncoding]
      ?: @"{\"status\":\"error\",\"kind\":\"internal\",\"message\":\"The sandbox returned invalid text.\"}";
}

} // namespace

@implementation JsSandboxRunner

+ (NSString *)runWithId:(NSString *)runId
                   code:(NSString *)code
              timeoutMs:(uint32_t)timeoutMs
            memoryBytes:(uint32_t)memoryBytes
         maxResultBytes:(uint32_t)maxResultBytes
            maxLogBytes:(uint32_t)maxLogBytes
{
  const cherry::jssandbox::Limits limits{
      timeoutMs, memoryBytes, maxResultBytes, maxLogBytes};
  return outcomeText(cherry::jssandbox::run(toUtf8(runId), toUtf8(code), limits));
}

+ (NSString *)runWithId:(NSString *)runId
                   code:(NSString *)code
             inputPaths:(NSArray<NSString *> *)inputPaths
             outputPath:(NSString *)outputPath
              timeoutMs:(uint32_t)timeoutMs
            memoryBytes:(uint32_t)memoryBytes
         maxResultBytes:(uint32_t)maxResultBytes
            maxLogBytes:(uint32_t)maxLogBytes
{
  const cherry::jssandbox::Limits limits{
      timeoutMs, memoryBytes, maxResultBytes, maxLogBytes};
  cherry::jssandbox::Files files;
  for (NSString *path in inputPaths) files.inputs.push_back(toUtf8(path));
  files.output = toUtf8(outputPath);
  return outcomeText(cherry::jssandbox::run(toUtf8(runId), toUtf8(code), limits, &files));
}

+ (void)cancelWithId:(NSString *)runId
{
  cherry::jssandbox::cancel(toUtf8(runId));
}

+ (NSString *)runBridgeWithId:(NSString *)runId
                       setup:(NSString *)setup
                        data:(NSString *)data
                   startedAt:(double)startedAt
                        seed:(uint32_t)seed
                   timeoutMs:(uint32_t)timeoutMs
                 memoryBytes:(uint32_t)memoryBytes
                        post:(void (^)(NSString *message))post
{
  const cherry::jssandbox::Limits limits{timeoutMs, memoryBytes, 0, 0};
  const std::string result = cherry::jssandbox::runBridge(
      toUtf8(runId), toUtf8(setup), toUtf8(data), startedAt, seed, limits,
      [post](const std::string &message) {
        NSString *text = [[NSString alloc] initWithBytes:message.data()
                                                length:message.size()
                                              encoding:NSUTF8StringEncoding];
        post(text ?: @"{\"type\":\"crash\",\"message\":\"Invalid native text\"}");
      });
  return [[NSString alloc] initWithBytes:result.data() length:result.size()
                               encoding:NSUTF8StringEncoding] ?: @"Invalid native text";
}

+ (void)deliverWithId:(NSString *)runId message:(NSString *)message
{
  cherry::jssandbox::deliver(toUtf8(runId), toUtf8(message));
}

@end
