#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

namespace cherry::jssandbox {

struct Limits {
  /// Wall-clock budget for compiling, running, and settling the script; 0 means
  /// none, leaving cancellation as the only stop.
  uint32_t timeoutMs;
  /// Cap on everything the QuickJS runtime allocates. Exceeding it fails the
  /// allocation inside the script instead of affecting the process.
  size_t memoryBytes;
  /// UTF-8 caps on the serialized result and on captured console output.
  size_t maxResultBytes;
  size_t maxLogBytes;
};

/// Runs `code` as the body of an async function in a fresh, isolated QuickJS
/// runtime on the calling thread, which must have a large enough native stack.
/// Returns a JSON object describing the outcome; never throws.
std::string run(const std::string &runId,
                const std::string &code,
                const Limits &limits);

/// Interrupts the run with this id, including one that has not started yet.
void cancel(const std::string &runId);

/// Runs a trusted bridge setup in the same isolated engine. The setup returns
/// deliver(JSON) and drained() ("again", "idle", or "done"). Only this thread
/// enters QuickJS; application replies are queued by deliver(). Returns an
/// empty string after normal completion, otherwise an error description.
std::string runBridge(const std::string &runId,
                      const std::string &setup,
                      const std::string &data,
                      double startedAt,
                      uint32_t seed,
                      const Limits &limits,
                      const std::function<void(const std::string &)> &post);

void deliver(const std::string &runId, const std::string &message);

} // namespace cherry::jssandbox
