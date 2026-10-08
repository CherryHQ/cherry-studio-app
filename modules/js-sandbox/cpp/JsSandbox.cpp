#include "JsSandbox.h"

#include "quickjs.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <deque>
#include <optional>
#include <unordered_map>
#include <unordered_set>

#if defined(__APPLE__)
#include <malloc/malloc.h>
#else
#include <malloc.h>
#endif

namespace cherry::jssandbox {

namespace {

using Clock = std::chrono::steady_clock;

constexpr size_t kMaxMessageBytes = 4000;
/// QuickJS throws a catchable RangeError past this much native stack, about
/// 7,000 JavaScript calls deep. The run thread has 8 MiB, which leaves room for
/// native code below the checks.
constexpr size_t kMaxStackBytes = 7u << 20;
/// Cancels that arrive before their run starts; the oldest are forgotten.
constexpr size_t kMaxPendingCancels = 64;

/// Installs `console`, `store`, and `load`, and returns `observe(promise)`,
/// which reports the settled value through `settle`, plus `describe(error)`.
/// Built-ins are captured before user code runs, so a script that replaces
/// them only spoils its own output.
///
/// `store(key, value)` and `load(key)` are adapted from Pi's codemode prelude
/// (`@earendil-works/pi-codemode`, MIT), keeping its limits and messages: they work
/// synchronously on `storeJson` (key -> JSON text), and a fulfilled script
/// reports the keys it wrote as `[[key, json] | [key]]`; a failed one drops them.
constexpr const char *kPrelude = R"JS((function (log, settle, storeJson) {
  'use strict';
  var stringify = JSON.stringify;
  var parse = JSON.parse;
  var then = Promise.prototype.then;
  var fromEntries = Object.fromEntries;
  var arrayFrom = Array.from;
  function replacer(key, value) {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Map) return fromEntries(value);
    if (value instanceof Set) return arrayFrom(value);
    return value;
  }
  // Keep only frames in the model's code. Its top level runs in the async
  // wrapper (`<anonymous>`); the global code that calls it (`<eval>`) is noise.
  var USER_FRAME = /\bsandbox\.js:\d+:\d+\)?$/;
  var WRAPPER_FRAME = /^\s*at <eval> /;
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
      if (frames.length < MAX_FRAMES) frames.push(line);
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

  // key -> JSON text. Sizes count key and JSON characters.
  var MAX_STORE_VALUE_CHARS = 262144;
  var MAX_STORE_TOTAL_CHARS = 1048576;
  var STORE_HINT = 'store() is for small state such as IDs, cursors, or summaries.';
  var stored = new Map(Object.entries(parse(storeJson)));
  var writes = new Map();
  var storedChars = 0;
  stored.forEach(function (json, key) {
    storedChars += key.length + json.length;
  });
  function checkKey(name, key) {
    if (typeof key !== 'string') throw new TypeError(name + '() key must be a string');
  }
  function store(key, value) {
    checkKey('store', key);
    var previous = stored.has(key) ? key.length + stored.get(key).length : 0;
    if (value === undefined) {
      stored.delete(key);
      storedChars -= previous;
      writes.set(key, undefined);
      return;
    }
    var json;
    try {
      json = stringify(value, replacer);
    } catch (error) {
      throw new TypeError('store(' + stringify(key) + ') value is not JSON-serializable: ' + format(error));
    }
    if (json === undefined) {
      throw new TypeError('store(' + stringify(key) + ') value is not JSON-serializable');
    }
    if (json.length > MAX_STORE_VALUE_CHARS) {
      throw new RangeError('store(' + stringify(key) + ') value has ' + json.length +
        ' characters of JSON, more than the limit of ' + MAX_STORE_VALUE_CHARS + '. ' + STORE_HINT);
    }
    var next = storedChars - previous + key.length + json.length;
    if (next > MAX_STORE_TOTAL_CHARS) {
      throw new RangeError('store is full: stored values would exceed ' + MAX_STORE_TOTAL_CHARS +
        ' characters of JSON. Delete keys with store(key, undefined). ' + STORE_HINT);
    }
    stored.set(key, json);
    storedChars = next;
    writes.set(key, json);
  }
  function load(key) {
    checkKey('load', key);
    var json = stored.get(key);
    return json === undefined ? undefined : parse(json);
  }
  function serializeWrites() {
    var entries = [];
    writes.forEach(function (json, key) {
      entries.push(json === undefined ? [key] : [key, json]);
    });
    return stringify(entries);
  }
  Object.defineProperty(globalThis, 'store', { value: store, enumerable: true });
  Object.defineProperty(globalThis, 'load', { value: load, enumerable: true });

  function observe(promise) {
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
        settle(true, text, serializeWrites());
      },
      function (error) {
        settle(false, describeError(error));
      }
    );
  }
  return { observe: observe, describe: describeError };
}))JS";

struct RunState {
  std::atomic<bool> cancelled{false};
};

std::mutex gRunsMutex;
std::unordered_map<std::string, std::shared_ptr<RunState>> gRuns;
/// Without a deadline a lost cancel would leave a script running for good, so a
/// cancel that beats its run's registration waits here for it.
std::unordered_set<std::string> gPendingCancels;
std::deque<std::string> gPendingCancelOrder;

struct Output {
  std::string logs;
  bool logsTruncated = false;
  bool settled = false;
  bool fulfilled = false;
  std::optional<std::string> payload;
  std::optional<std::string> storeWrites;
};

/// Every allocation of one runtime. QuickJS throws a catchable out-of-memory
/// error when an allocation fails; `exceeded` records that the cause was the
/// limit, since QuickJS cannot always allocate the error object itself.
struct Heap {
  size_t limit;
  size_t used = 0;
  bool exceeded = false;
};

struct Session {
  const Limits &limits;
  const RunState &state;
  Clock::time_point start;
  /// Absent when the run has no time limit; cancellation still stops it.
  std::optional<Clock::time_point> deadline = std::nullopt;
  /// Why the interrupt handler stopped the script; it keeps stopping it after.
  const char *interrupt = nullptr;
  Heap heap{limits.memoryBytes};
  Output output{};

  int64_t elapsedMs() const {
    return std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - start).count();
  }
};

/// Owns one reference; QuickJS values are reference counted.
class Value {
 public:
  Value(JSContext *ctx, JSValue value) : ctx_(ctx), value_(value) {}
  Value(const Value &) = delete;
  Value &operator=(const Value &) = delete;
  ~Value() { JS_FreeValue(ctx_, value_); }

  JSValue get() const { return value_; }
  bool isException() const { return JS_IsException(value_); }

  /// Hands the reference to a QuickJS call that consumes it.
  JSValue release() {
    JSValue value = value_;
    value_ = JS_UNDEFINED;
    return value;
  }

 private:
  JSContext *ctx_;
  JSValue value_;
};

size_t usableSize(const void *ptr) {
#if defined(__APPLE__)
  return malloc_size(ptr);
#else
  return malloc_usable_size(const_cast<void *>(ptr));
#endif
}

bool admit(Heap &heap, size_t releasing, size_t requested) {
  // Usable sizes can exceed requests, so `base` may already be over the limit.
  const size_t base = heap.used - releasing;
  if (base > heap.limit || requested > heap.limit - base) {
    heap.exceeded = true;
    return false;
  }
  return true;
}

void *heapCalloc(void *opaque, size_t count, size_t size) {
  auto &heap = *static_cast<Heap *>(opaque);
  if (size != 0 && count > SIZE_MAX / size) {
    return nullptr;
  }
  if (!admit(heap, 0, count * size)) {
    return nullptr;
  }
  void *ptr = std::calloc(count, size);
  if (ptr) {
    heap.used += usableSize(ptr);
  }
  return ptr;
}

void *heapMalloc(void *opaque, size_t size) {
  auto &heap = *static_cast<Heap *>(opaque);
  if (!admit(heap, 0, size)) {
    return nullptr;
  }
  void *ptr = std::malloc(size);
  if (ptr) {
    heap.used += usableSize(ptr);
  }
  return ptr;
}

void heapFree(void *opaque, void *ptr) {
  if (ptr) {
    static_cast<Heap *>(opaque)->used -= usableSize(ptr);
    std::free(ptr);
  }
}

void *heapRealloc(void *opaque, void *ptr, size_t size) {
  auto &heap = *static_cast<Heap *>(opaque);
  const size_t previous = ptr ? usableSize(ptr) : 0;
  if (!admit(heap, previous, size)) {
    return nullptr;
  }
  void *next = std::realloc(ptr, size);
  if (next) {
    heap.used = heap.used - previous + usableSize(next);
  }
  return next;
}

constexpr JSMallocFunctions kHeapFunctions{
    heapCalloc, heapMalloc, heapFree, heapRealloc, usableSize};

struct RuntimeDeleter {
  void operator()(JSRuntime *rt) const { JS_FreeRuntime(rt); }
};

struct ContextDeleter {
  void operator()(JSContext *ctx) const { JS_FreeContext(ctx); }
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

/// QuickJS encodes a lone surrogate as ED A0–BF xx, which is not UTF-8 and
/// fails the platform string conversion; replace it with U+FFFD.
std::string toUtf8(JSContext *ctx, JSValueConst value) {
  size_t length = 0;
  const char *bytes = JS_ToCStringLen(ctx, &length, value);
  if (!bytes) {
    JS_FreeValue(ctx, JS_GetException(ctx));
    return {};
  }
  std::string text(bytes, length);
  JS_FreeCString(ctx, bytes);
  for (size_t i = 0; i + 2 < text.size(); i++) {
    if (static_cast<unsigned char>(text[i]) == 0xED &&
        static_cast<unsigned char>(text[i + 1]) >= 0xA0) {
      text.replace(i, 3, "\xEF\xBF\xBD");
      i += 2;
    }
  }
  return text;
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

std::string errorResult(const char *kind, const std::string &message, const Session &session) {
  return ResultWriter("error")
      .field("kind", std::string(kind))
      .field("message", truncateUtf8(message, kMaxMessageBytes))
      .field("logs", session.output.logs)
      .field("logsTruncated", session.output.logsTruncated)
      .field("durationMs", session.elapsedMs())
      .finish();
}

std::string memoryResult(const Session &session) {
  return errorResult("memory",
                     "The script exceeded the " +
                         std::to_string(session.limits.memoryBytes >> 20) +
                         " MiB memory limit.",
                     session);
}

std::string interruptResult(const Session &session) {
  if (std::strcmp(session.interrupt, "cancelled") == 0) {
    return errorResult("cancelled", "The run was cancelled.", session);
  }
  return errorResult("timeout",
                     "The script exceeded the " + std::to_string(session.limits.timeoutMs) +
                         " ms time limit and was stopped.",
                     session);
}

/// Polled by QuickJS during bytecode and regular expression execution. Once it
/// returns nonzero it keeps doing so, so every later job stops as well.
int interruptHandler(JSRuntime *, void *opaque) {
  auto &session = *static_cast<Session *>(opaque);
  if (!session.interrupt) {
    if (session.state.cancelled) {
      session.interrupt = "cancelled";
    } else if (session.deadline && Clock::now() >= *session.deadline) {
      session.interrupt = "timeout";
    }
  }
  return session.interrupt ? 1 : 0;
}

Session &sessionOf(JSContext *ctx) {
  return *static_cast<Session *>(JS_GetContextOpaque(ctx));
}

JSValue hostLog(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  auto &session = sessionOf(ctx);
  auto &output = session.output;
  if (output.logsTruncated || argc < 2 || !JS_IsString(argv[0]) || !JS_IsString(argv[1])) {
    return JS_UNDEFINED;
  }
  const auto level = toUtf8(ctx, argv[0]);
  std::string line = level == "log" ? "" : "[" + level + "] ";
  line += toUtf8(ctx, argv[1]);
  line.push_back('\n');
  const size_t maxLogBytes = session.limits.maxLogBytes;
  const size_t room = maxLogBytes - std::min(maxLogBytes, output.logs.size());
  output.logs += truncateUtf8(line, room, &output.logsTruncated);
  return JS_UNDEFINED;
}

JSValue hostSettle(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  auto &output = sessionOf(ctx).output;
  if (output.settled || argc < 2) {
    return JS_UNDEFINED;
  }
  output.settled = true;
  output.fulfilled = JS_IsBool(argv[0]) && JS_ToBool(ctx, argv[0]) == 1;
  if (JS_IsString(argv[1])) {
    output.payload = toUtf8(ctx, argv[1]);
  }
  if (argc > 2 && JS_IsString(argv[2])) {
    output.storeWrites = toUtf8(ctx, argv[2]);
  }
  return JS_UNDEFINED;
}

/// Reports the pending exception: the interrupt reason first, then the memory
/// limit, then the prelude's description of the error.
std::string failure(JSContext *ctx, const Session &session, const char *kind,
                    JSValueConst describe) {
  Value exception(ctx, JS_GetException(ctx));
  if (session.interrupt) {
    return interruptResult(session);
  }
  if (session.heap.exceeded) {
    return memoryResult(session);
  }
  if (!JS_IsFunction(ctx, describe)) {
    return errorResult(kind, toUtf8(ctx, exception.get()), session);
  }
  JSValue args[] = {exception.get()};
  Value text(ctx, JS_Call(ctx, describe, JS_UNDEFINED, 1, args));
  if (text.isException()) {
    JS_FreeValue(ctx, JS_GetException(ctx));
    return errorResult(kind, toUtf8(ctx, exception.get()), session);
  }
  return errorResult(kind, toUtf8(ctx, text.get()), session);
}

/// Runs promise jobs until none remain or the script is stopped. A job that
/// fails here was interrupted or ran out of memory; the outcome reports both.
void drainJobs(JSRuntime *rt, const Session &session) {
  while (!session.interrupt && JS_IsJobPending(rt)) {
    JSContext *jobContext = nullptr;
    if (JS_ExecutePendingJob(rt, &jobContext) < 0 && jobContext) {
      JS_FreeValue(jobContext, JS_GetException(jobContext));
    }
  }
}

std::string outcome(const Session &session) {
  const auto &output = session.output;
  if (session.interrupt) {
    return interruptResult(session);
  }
  if (!output.settled) {
    return errorResult(
        "unsettled",
        "The returned promise never settled. This sandbox has no timers, network, or other "
        "asynchronous sources, so awaiting them waits forever.",
        session);
  }
  if (!output.fulfilled) {
    return session.heap.exceeded
               ? memoryResult(session)
               : errorResult("exception", output.payload.value_or("The script failed."), session);
  }
  ResultWriter writer("ok");
  if (output.payload) {
    bool truncated = false;
    writer
        .field("result", truncateUtf8(*output.payload, session.limits.maxResultBytes, &truncated))
        .field("resultTruncated", truncated);
  }
  if (output.storeWrites) {
    writer.field("storeWrites", *output.storeWrites);
  }
  return writer.field("logs", output.logs)
      .field("logsTruncated", output.logsTruncated)
      .field("durationMs", session.elapsedMs())
      .finish();
}

std::string execute(const std::string &code, const std::string &storeJson, Session &session) {
  // The context is declared after the runtime and every value after the
  // context, so they are released in the order QuickJS requires.
  std::unique_ptr<JSRuntime, RuntimeDeleter> runtime(
      JS_NewRuntime2(&kHeapFunctions, &session.heap));
  if (!runtime) {
    return errorResult("internal", "Could not start the sandbox.", session);
  }
  JSRuntime *rt = runtime.get();
  JS_SetMaxStackSize(rt, kMaxStackBytes);
  JS_SetInterruptHandler(rt, interruptHandler, &session);

  // Standard built-ins only: QuickJS' std and os modules are not compiled in,
  // so the global object reaches nothing outside this runtime.
  std::unique_ptr<JSContext, ContextDeleter> context(JS_NewContext(rt));
  if (!context) {
    return errorResult("internal", "Could not start the sandbox.", session);
  }
  JSContext *ctx = context.get();
  JS_SetContextOpaque(ctx, &session);

  Value install(ctx, JS_Eval(ctx, kPrelude, std::strlen(kPrelude), "prelude.js",
                             JS_EVAL_TYPE_GLOBAL));
  if (install.isException()) {
    return failure(ctx, session, "internal", JS_UNDEFINED);
  }
  Value log(ctx, JS_NewCFunction(ctx, hostLog, "log", 2));
  Value settle(ctx, JS_NewCFunction(ctx, hostSettle, "settle", 3));
  Value store(ctx, JS_NewStringLen(ctx, storeJson.data(), storeJson.size()));
  JSValue hookArgs[] = {log.get(), settle.get(), store.get()};
  Value hooks(ctx, JS_Call(ctx, install.get(), JS_UNDEFINED, 3, hookArgs));
  if (hooks.isException()) {
    return failure(ctx, session, "internal", JS_UNDEFINED);
  }
  Value observe(ctx, JS_GetPropertyStr(ctx, hooks.get(), "observe"));
  Value describe(ctx, JS_GetPropertyStr(ctx, hooks.get(), "describe"));

  // Opening on the first line keeps reported line numbers equal to the
  // model's own; the newline before the close survives a trailing comment.
  const std::string source = "(async function () {" + code + "\n})()";
  Value compiled(ctx, JS_Eval(ctx, source.c_str(), source.size(), "sandbox.js",
                              JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY));
  if (compiled.isException()) {
    return failure(ctx, session, "syntax", describe.get());
  }
  // Script errors become rejections of the returned promise; anything thrown
  // here is an interruption or a failure to allocate.
  Value promise(ctx, JS_EvalFunction(ctx, compiled.release()));
  if (promise.isException()) {
    return failure(ctx, session, "internal", describe.get());
  }
  JSValue observeArgs[] = {promise.get()};
  Value observed(ctx, JS_Call(ctx, observe.get(), JS_UNDEFINED, 1, observeArgs));
  if (observed.isException()) {
    return failure(ctx, session, "internal", describe.get());
  }

  drainJobs(rt, session);
  return outcome(session);
}

} // namespace

std::string run(const std::string &runId,
                const std::string &code,
                const std::string &storeJson,
                const Limits &limits) {
  auto state = std::make_shared<RunState>();
  {
    std::lock_guard<std::mutex> lock(gRunsMutex);
    gRuns[runId] = state;
    if (gPendingCancels.erase(runId) > 0) {
      state->cancelled = true;
    }
  }

  const auto start = Clock::now();
  Session session{limits, *state, start};
  if (limits.timeoutMs > 0) {
    session.deadline = start + std::chrono::milliseconds(limits.timeoutMs);
  }
  std::string result;
  try {
    result = execute(code, storeJson, session);
  } catch (const std::exception &error) {
    result = errorResult("internal", error.what(), session);
  }

  std::lock_guard<std::mutex> lock(gRunsMutex);
  auto found = gRuns.find(runId);
  if (found != gRuns.end() && found->second == state) {
    gRuns.erase(found);
  }
  return result;
}

void cancel(const std::string &runId) {
  std::lock_guard<std::mutex> lock(gRunsMutex);
  auto found = gRuns.find(runId);
  if (found != gRuns.end()) {
    found->second->cancelled = true;
    return;
  }
  // The run has not registered yet, or has already finished; the latter leaves
  // an entry that ages out.
  if (gPendingCancels.insert(runId).second) {
    gPendingCancelOrder.push_back(runId);
    if (gPendingCancelOrder.size() > kMaxPendingCancels) {
      gPendingCancels.erase(gPendingCancelOrder.front());
      gPendingCancelOrder.pop_front();
    }
  }
}

} // namespace cherry::jssandbox
