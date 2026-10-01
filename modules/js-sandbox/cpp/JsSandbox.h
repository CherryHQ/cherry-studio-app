#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace cherry::jssandbox {

struct Limits {
  /// Wall-clock budget for compiling, running, and settling the script.
  uint32_t timeoutMs;
  /// Heap size after a collection that stops the script. Hermes aborts the
  /// whole process at `hardHeapBytes`, so this soft limit must trip first.
  uint32_t softHeapBytes;
  uint32_t hardHeapBytes;
  /// UTF-8 caps on the serialized result and on captured console output.
  size_t maxResultBytes;
  size_t maxLogBytes;
};

/// Runs `code` as the body of an async function in a fresh, isolated Hermes
/// runtime on the calling thread, which must have a large enough native stack.
/// Returns a JSON object describing the outcome; never throws.
std::string run(const std::string &runId, const std::string &code, const Limits &limits);

/// Interrupts the run with this id. Unknown or finished ids are ignored.
void cancel(const std::string &runId);

} // namespace cherry::jssandbox
