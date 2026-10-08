#pragma once

#include <cstddef>
#include <cstdint>
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
/// `storeJson` maps keys to JSON text for `load()`; a fulfilled run reports its
/// `store()` writes. Returns a JSON object describing the outcome; never throws.
std::string run(const std::string &runId,
                const std::string &code,
                const std::string &storeJson,
                const Limits &limits);

/// Interrupts the run with this id, including one that has not started yet.
void cancel(const std::string &runId);

} // namespace cherry::jssandbox
