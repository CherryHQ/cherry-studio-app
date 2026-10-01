#include "JsSandbox.h"

#include <hermes/Public/GCConfig.h>
#include <hermes/Public/GCTripwireContext.h>
#include <hermes/Public/RuntimeConfig.h>
#include <hermes/hermes.h>
#include <jsi/jsi.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <optional>
#include <unordered_map>

namespace cherry::jssandbox {

namespace {

namespace fh = facebook::hermes;
namespace jsi = facebook::jsi;

constexpr size_t kMaxMessageBytes = 4000;
constexpr uint32_t kInitialHeapBytes = 4u << 20;

/// Installs `console` and returns `observe(promise)`, which reports the
/// settled value through `settle`. Built-ins are captured before user code
/// runs, so a script that replaces them only spoils its own output.
constexpr const char *kPrelude = R"JS((function (log, settle) {
  'use strict';
  var stringify = JSON.stringify;
  var then = Promise.prototype.then;
  var fromEntries = Object.fromEntries;
  var arrayFrom = Array.from;
  function replacer(key, value) {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Map) return fromEntries(value);
    if (value instanceof Set) return arrayFrom(value);
    return value;
  }
  // Keep only frames in the model's code; the async wrapper and engine
  // internals are noise to it.
  var USER_FRAME = /\(sandbox\.js:\d+:\d+\)$/;
  var WRAPPER_FRAME = /^\s*at (global|anonymous) \(sandbox\.js:/;
  var MAX_FRAMES = 8;
  function describeError(error) {
    if (!(error instanceof Error)) return 'Uncaught ' + format(error);
    var head = String(error);
    var stack = typeof error.stack === 'string' ? error.stack.split('\n') : [];
    var frames = [];
    var omitted = 0;
    for (var i = 0; i < stack.length; i++) {
      var line = stack[i];
      if (!USER_FRAME.test(line) || WRAPPER_FRAME.test(line)) continue;
      if (frames.length < MAX_FRAMES) frames.push(line.replace('?anon_0_', 'code'));
      else omitted++;
    }
    if (omitted > 0) frames.push('    ... ' + omitted + ' more frames');
    return frames.length > 0 ? head + '\n' + frames.join('\n') : head;
  }
  function format(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return describeError(value);
    try {
      var text = stringify(value, replacer);
      return text === undefined ? String(value) : text;
    } catch (error) {
      return String(value);
    }
  }
  function writer(level) {
    return function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(format(arguments[i]));
      log(level, parts.join(' '));
    };
  }
  var sandboxConsole = {
    debug: writer('debug'),
    error: writer('error'),
    info: writer('info'),
    log: writer('log'),
    warn: writer('warn'),
  };
  globalThis.console = sandboxConsole;
  globalThis.print = sandboxConsole.log;
  return function observe(promise) {
    then.call(
      promise,
      function (value) {
        var text;
        try {
          text = stringify(value, replacer);
        } catch (error) {
          settle(false, 'The returned value is not JSON-serializable: ' + format(error));
          return;
        }
        settle(true, text);
      },
      function (error) {
        settle(false, describeError(error));
      }
    );
  };
}))JS";

struct RunState {
  std::atomic<fh::IHermes *> hermes{nullptr};
  std::atomic<bool> cancelled{false};
  std::atomic<bool> memoryExceeded{false};
};

std::mutex gRunsMutex;
std::unordered_map<std::string, std::shared_ptr<RunState>> gRuns;

struct Output {
  std::string logs;
  bool logsTruncated = false;
  bool settled = false;
  bool fulfilled = false;
  std::optional<std::string> payload;
};

/// Cuts at a UTF-8 code point boundary at or below `maxBytes`.
std::string truncateUtf8(const std::string &text, size_t maxBytes, bool *truncated = nullptr) {
  if (text.size() <= maxBytes) {
    return text;
  }
  size_t end = maxBytes;
  while (end > 0 && (static_cast<unsigned char>(text[end]) & 0xC0) == 0x80) {
    end--;
  }
  if (truncated) {
    *truncated = true;
  }
  return text.substr(0, end);
}

void appendJsonString(std::string &out, const std::string &value) {
  static const char *kHex = "0123456789abcdef";
  out.push_back('"');
  for (char c : value) {
    switch (c) {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          out += "\\u00";
          out.push_back(kHex[(c >> 4) & 0xF]);
          out.push_back(kHex[c & 0xF]);
        } else {
          out.push_back(c);
        }
    }
  }
  out.push_back('"');
}

class ResultWriter {
 public:
  explicit ResultWriter(const char *status) {
    json_ = "{\"status\":";
    appendJsonString(json_, status);
  }

  ResultWriter &field(const char *name, const std::string &value) {
    key(name);
    appendJsonString(json_, value);
    return *this;
  }

  ResultWriter &field(const char *name, bool value) {
    key(name);
    json_ += value ? "true" : "false";
    return *this;
  }

  ResultWriter &field(const char *name, int64_t value) {
    key(name);
    json_ += std::to_string(value);
    return *this;
  }

  std::string finish() {
    json_.push_back('}');
    return std::move(json_);
  }

 private:
  void key(const char *name) {
    json_.push_back(',');
    appendJsonString(json_, name);
    json_.push_back(':');
  }

  std::string json_;
};

std::string errorResult(
    const char *kind,
    const std::string &message,
    const Output &output,
    int64_t durationMs) {
  return ResultWriter("error")
      .field("kind", std::string(kind))
      .field("message", truncateUtf8(message, kMaxMessageBytes))
      .field("logs", output.logs)
      .field("logsTruncated", output.logsTruncated)
      .field("durationMs", durationMs)
      .finish();
}

::hermes::vm::RuntimeConfig makeConfig(
    const Limits &limits,
    const std::shared_ptr<RunState> &state) {
  // The hardened base disables eval, Function, Proxy, and other surfaces that
  // untrusted code does not need.
  auto base = fh::hardenedHermesRuntimeConfig();
  auto tripwire = ::hermes::vm::GCTripwireConfig::Builder()
                      .withLimit(limits.softHeapBytes)
                      .withCallback([state](::hermes::vm::GCTripwireContext &) {
                        // Runs on the script thread during a collection. The
                        // tripwire fires once per runtime, which is why every
                        // run gets a fresh runtime.
                        state->memoryExceeded = true;
                        if (auto *hermes = state->hermes.load()) {
                          hermes->asyncTriggerTimeout();
                        }
                      })
                      .build();
  auto gc = base.getGCConfig()
                .rebuild()
                .withName("JsSandbox")
                .withInitHeapSize(std::min(kInitialHeapBytes, limits.softHeapBytes))
                .withMaxHeapSize(limits.hardHeapBytes)
                .withTripwireConfig(tripwire)
                .build();
  // Without block scoping, `let` bindings in loops share one slot and closures
  // capture the final value; without the microtask queue, `await` never runs.
  return base.rebuild()
      .withES6BlockScoping(true)
      .withMicrotaskQueue(true)
      .withGCConfig(gc)
      .build();
}

const char *classifyInterrupt(const RunState &state) {
  if (state.memoryExceeded) {
    return "memory";
  }
  if (state.cancelled) {
    return "cancelled";
  }
  return "timeout";
}

bool isTimeoutMessage(const std::string &message) {
  return message.find("execution has timed out") != std::string::npos;
}

} // namespace

std::string run(const std::string &runId, const std::string &code, const Limits &limits) {
  const auto start = std::chrono::steady_clock::now();
  const auto elapsedMs = [&start] {
    return static_cast<int64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                    std::chrono::steady_clock::now() - start)
                                    .count());
  };

  auto state = std::make_shared<RunState>();
  Output output;

  std::unique_ptr<fh::HermesRuntime> runtime;
  try {
    runtime = fh::makeHermesRuntime(makeConfig(limits, state));
  } catch (const std::exception &error) {
    return errorResult("internal", std::string("Could not start the sandbox: ") + error.what(),
                       output, elapsedMs());
  }
  auto *hermes = jsi::castInterface<fh::IHermes>(runtime.get());
  if (!hermes) {
    return errorResult("internal", "The sandbox runtime does not support interruption.", output,
                       elapsedMs());
  }

  {
    std::lock_guard<std::mutex> lock(gRunsMutex);
    state->hermes = hermes;
    gRuns[runId] = state;
  }

  // Deregister before the runtime is destroyed so `cancel` never reaches a
  // dead runtime.
  const auto release = [&] {
    std::lock_guard<std::mutex> lock(gRunsMutex);
    state->hermes = nullptr;
    auto found = gRuns.find(runId);
    if (found != gRuns.end() && found->second == state) {
      gRuns.erase(found);
    }
  };

  jsi::Runtime &rt = *runtime;
  std::string result;
  bool compiled = false;
  hermes->watchTimeLimit(limits.timeoutMs);
  try {
    if (state->cancelled) {
      throw jsi::JSINativeException("Javascript execution has timed out.");
    }
    auto log = jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "log"), 2,
        [&output, &limits](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
                           size_t count) {
          if (output.logsTruncated || count < 2 || !args[0].isString() || !args[1].isString()) {
            return jsi::Value::undefined();
          }
          const auto level = args[0].getString(rt).utf8(rt);
          std::string line = level == "log" ? "" : "[" + level + "] ";
          line += args[1].getString(rt).utf8(rt);
          line.push_back('\n');
          const size_t room = limits.maxLogBytes - std::min(limits.maxLogBytes, output.logs.size());
          output.logs += truncateUtf8(line, room, &output.logsTruncated);
          return jsi::Value::undefined();
        });
    auto settle = jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "settle"), 2,
        [&output](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) {
          if (output.settled || count < 1) {
            return jsi::Value::undefined();
          }
          output.settled = true;
          output.fulfilled = args[0].isBool() && args[0].getBool();
          if (count > 1 && args[1].isString()) {
            output.payload = args[1].getString(rt).utf8(rt);
          }
          return jsi::Value::undefined();
        });

    auto install = rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(kPrelude),
                                         "prelude.js")
                       .asObject(rt)
                       .asFunction(rt);
    auto observe = install.call(rt, log, settle).asObject(rt).asFunction(rt);

    // Opening on the first line keeps reported line numbers equal to the
    // model's own; the newline before the close survives a trailing comment.
    auto promise = rt.evaluateJavaScript(
        std::make_shared<jsi::StringBuffer>("(async function () {" + code + "\n})()"),
        "sandbox.js");
    compiled = true;
    observe.call(rt, promise);
    while (!rt.drainMicrotasks()) {
    }

    if (!output.settled) {
      result = errorResult(
          "unsettled",
          "The returned promise never settled. This sandbox has no timers, network, or other "
          "asynchronous sources, so awaiting them waits forever.",
          output, elapsedMs());
    } else if (!output.fulfilled) {
      result = errorResult("exception", output.payload.value_or("The script failed."), output,
                           elapsedMs());
    } else {
      ResultWriter writer("ok");
      if (output.payload) {
        bool truncated = false;
        writer.field("result", truncateUtf8(*output.payload, limits.maxResultBytes, &truncated))
            .field("resultTruncated", truncated);
      }
      result = writer.field("logs", output.logs)
                   .field("logsTruncated", output.logsTruncated)
                   .field("durationMs", elapsedMs())
                   .finish();
    }
  } catch (const jsi::JSIException &error) {
    const std::string message = error.what();
    if (isTimeoutMessage(message) || state->memoryExceeded || state->cancelled) {
      const char *kind = classifyInterrupt(*state);
      const std::string detail =
          std::string(kind) == "memory"
              ? "The script exceeded the sandbox memory limit and was stopped."
          : std::string(kind) == "cancelled"
              ? "The run was cancelled."
              : "The script exceeded the " + std::to_string(limits.timeoutMs) +
                    " ms time limit and was stopped.";
      result = errorResult(kind, detail, output, elapsedMs());
    } else {
      // Anything thrown before the wrapper compiles is a syntax error; after
      // that, script errors arrive as promise rejections instead.
      result = errorResult(compiled ? "internal" : "syntax", message, output, elapsedMs());
    }
  } catch (const std::exception &error) {
    result = errorResult("internal", error.what(), output, elapsedMs());
  }

  hermes->unwatchTimeLimit();
  release();
  runtime.reset();
  return result;
}

void cancel(const std::string &runId) {
  std::lock_guard<std::mutex> lock(gRunsMutex);
  auto found = gRuns.find(runId);
  if (found == gRuns.end()) {
    return;
  }
  found->second->cancelled = true;
  if (auto *hermes = found->second->hermes.load()) {
    hermes->asyncTriggerTimeout();
  }
}

} // namespace cherry::jssandbox
