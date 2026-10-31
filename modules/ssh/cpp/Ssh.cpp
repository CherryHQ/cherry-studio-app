#include "Ssh.h"
#include <libssh2.h>
#include <openssl/crypto.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cerrno>
#include <condition_variable>
#include <cstring>
#include <fcntl.h>
#include <map>
#include <memory>
#include <mutex>
#include <netdb.h>
#include <poll.h>
#include <stdexcept>
#include <sys/socket.h>
#include <thread>
#include <utility>
#include <unistd.h>
#include <vector>

namespace cherry::ssh {
namespace {
using Clock = std::chrono::steady_clock;
constexpr size_t maxOutput = 256 * 1024;
struct Run { std::atomic<bool> cancelled{false}; bool started = false; };
std::mutex runsLock;
std::map<std::string, std::shared_ptr<Run>> runs;
std::once_flag initialization;
int initResult = -1;
std::atomic<int> resolvers{0};
struct Failure : std::runtime_error { using std::runtime_error::runtime_error; };

std::string base64(const char *data, size_t size) {
  static constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result;
  result.reserve((size + 2) / 3 * 4);
  for (size_t i = 0; i < size; i += 3) {
    unsigned value = static_cast<unsigned char>(data[i]) << 16;
    if (i + 1 < size) value |= static_cast<unsigned char>(data[i + 1]) << 8;
    if (i + 2 < size) value |= static_cast<unsigned char>(data[i + 2]);
    result += alphabet[(value >> 18) & 63];
    result += alphabet[(value >> 12) & 63];
    result += i + 1 < size ? alphabet[(value >> 6) & 63] : '=';
    result += i + 2 < size ? alphabet[value & 63] : '=';
  }
  return result;
}

void check(const std::shared_ptr<Run> &run, Clock::time_point deadline) {
  if (run->cancelled) throw Failure("cancelled");
  if (Clock::now() >= deadline) throw Failure("timeout");
}

// DNS is not cancellable on either POSIX platform. A bounded resolver pool owns
// host-only copies; callers still observe cancellation/deadlines immediately.
struct Address { sockaddr_storage value; socklen_t length; int family; };
struct Resolution {
  std::mutex lock;
  std::condition_variable changed;
  bool done = false;
  std::vector<Address> addresses;
};
std::vector<Address> resolve(const Options &options, const std::shared_ptr<Run> &run,
                             Clock::time_point deadline) {
  if (resolvers.fetch_add(1) >= 4) {
    --resolvers;
    throw Failure("busy");
  }
  auto state = std::make_shared<Resolution>();
  try {
    std::thread([state, host = options.host, port = std::to_string(options.port)] {
      addrinfo hints{}, *result = nullptr;
      hints.ai_family = AF_UNSPEC;
      hints.ai_socktype = SOCK_STREAM;
      std::vector<Address> addresses;
      if (getaddrinfo(host.c_str(), port.c_str(), &hints, &result) == 0) {
        for (auto item = result; item && addresses.size() < 16; item = item->ai_next) {
          if (item->ai_addrlen > sizeof(sockaddr_storage)) continue;
          Address address{};
          std::memcpy(&address.value, item->ai_addr, item->ai_addrlen);
          address.length = static_cast<socklen_t>(item->ai_addrlen);
          address.family = item->ai_family;
          addresses.push_back(address);
        }
        freeaddrinfo(result);
      }
      {
        std::lock_guard<std::mutex> guard(state->lock);
        state->addresses = std::move(addresses);
        state->done = true;
      }
      --resolvers;
      state->changed.notify_all();
    }).detach();
  } catch (...) { --resolvers; throw; }
  std::unique_lock<std::mutex> lock(state->lock);
  while (!state->done) {
    check(run, deadline);
    state->changed.wait_for(lock, std::chrono::milliseconds(100));
  }
  check(run, deadline);
  if (state->addresses.empty()) throw Failure("resolve");
  return std::move(state->addresses);
}

struct Connection {
  int socket = -1;
  LIBSSH2_SESSION *session = nullptr;
  LIBSSH2_CHANNEL *channel = nullptr;
  ~Connection() {
    // Shutdown makes cleanup finite even if the peer stopped responding.
    if (socket >= 0) shutdown(socket, SHUT_RDWR);
    if (session) {
      libssh2_session_set_blocking(session, 0);
      if (channel) libssh2_channel_free(channel);
      libssh2_session_free(session);
    }
    if (socket >= 0) close(socket);
  }
};

void waitSocket(Connection &connection, const std::shared_ptr<Run> &run,
                Clock::time_point deadline) {
  check(run, deadline);
  int directions = connection.session ? libssh2_session_block_directions(connection.session) : 0;
  short events = 0;
  if (directions & LIBSSH2_SESSION_BLOCK_INBOUND) events |= POLLIN;
  if (directions & LIBSSH2_SESSION_BLOCK_OUTBOUND) events |= POLLOUT;
  if (!events) events = POLLIN;
  pollfd fd{connection.socket, events, 0};
  const int result = poll(&fd, 1, 100);
  if (result < 0 && errno != EINTR) throw Failure("connection");
  if (result > 0 && (fd.revents & POLLNVAL)) throw Failure("connection");
  check(run, deadline);
}

template <typename F>
int retry(Connection &connection, const std::shared_ptr<Run> &run,
          Clock::time_point deadline, F operation) {
  int result;
  do {
    check(run, deadline);
    result = operation();
    if (result == LIBSSH2_ERROR_EAGAIN) waitSocket(connection, run, deadline);
  } while (result == LIBSSH2_ERROR_EAGAIN);
  return result;
}

void connect(Connection &connection, const Options &options,
             const std::shared_ptr<Run> &run, Clock::time_point deadline) {
  for (const auto &address : resolve(options, run, deadline)) {
    check(run, deadline);
    connection.socket = socket(address.family, SOCK_STREAM, 0);
    if (connection.socket < 0) continue;
    const int flags = fcntl(connection.socket, F_GETFL, 0);
    if (flags < 0 || fcntl(connection.socket, F_SETFL, flags | O_NONBLOCK) < 0) {
      close(connection.socket); connection.socket = -1; continue;
    }
#ifdef SO_NOSIGPIPE
    int one = 1;
    setsockopt(connection.socket, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof(one));
#endif
    int status = ::connect(connection.socket, reinterpret_cast<const sockaddr *>(&address.value), address.length);
    if (status != 0 && errno == EINPROGRESS) {
      // Give alternate IPv4/IPv6 addresses a chance before the overall deadline.
      const auto attemptDeadline = std::min(deadline, Clock::now() + std::chrono::seconds(3));
      while (Clock::now() < attemptDeadline) {
        check(run, deadline);
        pollfd fd{connection.socket, POLLOUT, 0};
        int ready = poll(&fd, 1, 100);
        if (ready > 0) {
          int error = 0;
          socklen_t size = sizeof(error);
          status = getsockopt(connection.socket, SOL_SOCKET, SO_ERROR, &error, &size) == 0 && error == 0 ? 0 : -1;
          break;
        }
        if (ready < 0 && errno != EINTR) break;
      }
    }
    if (status == 0) return;
    close(connection.socket);
    connection.socket = -1;
  }
  throw Failure("connection");
}

void erase(std::string &value) {
  if (!value.empty()) OPENSSL_cleanse(value.data(), value.size());
  value.clear();
}
struct CredentialCleanup {
  Options &options;
  ~CredentialCleanup() {
    erase(options.password); erase(options.privateKey); erase(options.passphrase);
  }
};
}

bool prepare(const std::string &id) {
  std::lock_guard<std::mutex> guard(runsLock);
  if (id.empty() || id.size() > 100 || runs.size() >= 4 || runs.count(id)) return false;
  runs[id] = std::make_shared<Run>();
  return true;
}
void cancel(const std::string &id) {
  std::lock_guard<std::mutex> guard(runsLock);
  if (auto found = runs.find(id); found != runs.end()) {
    found->second->cancelled = true;
    if (!found->second->started) runs.erase(found);
  }
}
void cancelAll() {
  std::lock_guard<std::mutex> guard(runsLock);
  for (auto item = runs.begin(); item != runs.end();) {
    item->second->cancelled = true;
    if (!item->second->started) item = runs.erase(item);
    else ++item;
  }
}

std::string run(const std::string &id, Options options, const Output &output) {
  CredentialCleanup credentials{options};
  std::shared_ptr<Run> state;
  {
    std::lock_guard<std::mutex> guard(runsLock);
    auto found = runs.find(id);
    if (found == runs.end() || found->second->started)
      return R"({"state":"not-started","error":"cancelled","stdout":"","stderr":"","fingerprint":"","exitCode":null,"truncated":false})";
    state = found->second;
    state->started = true;
  }
  std::string remoteState = "not-started", error, fingerprint, out, err;
  bool truncated = false;
  bool hasExit = false;
  int exitCode = 0;
  try {
    const auto valid = [](const std::string &text, size_t max) { return text.size() <= max && text.find('\0') == std::string::npos; };
    if (options.host.empty() || !valid(options.host, 253) || options.port < 1 || options.port > 65535 ||
        !valid(options.username, 256) || !valid(options.password, 65536) ||
        !valid(options.privateKey, 65536) || !valid(options.passphrase, 65536) ||
        !valid(options.command, 32768) || (!options.probe && options.command.empty()))
      throw Failure("invalid-input");
    std::call_once(initialization, [] { initResult = libssh2_init(0); });
    if (initResult != 0) throw Failure("unavailable");
    const auto deadline = Clock::now() + std::chrono::milliseconds(std::clamp(options.timeoutMs, 1000, 120000));
    const auto connectionDeadline = std::min(deadline, Clock::now() + std::chrono::seconds(20));
    Connection connection;
    connect(connection, options, state, connectionDeadline);
    connection.session = libssh2_session_init();
    if (!connection.session) throw Failure("unavailable");
    libssh2_session_set_blocking(connection.session, 0);
    libssh2_session_flag(connection.session, LIBSSH2_FLAG_SIGPIPE, 0);
    if (retry(connection, state, connectionDeadline, [&] { return libssh2_session_handshake(connection.session, connection.socket); }) != 0)
      throw Failure("handshake");
    const char *hash = libssh2_hostkey_hash(connection.session, LIBSSH2_HOSTKEY_HASH_SHA256);
    if (!hash) throw Failure("handshake");
    fingerprint = "SHA256:" + base64(hash, 32);
    while (fingerprint.back() == '=') fingerprint.pop_back();
    if (options.probe) {
      remoteState = "probed";
    } else {
      // No authentication material is sent until the exact approved key matches.
      if (options.fingerprint != fingerprint) throw Failure("host-key");
      const int auth = retry(connection, state, connectionDeadline, [&] {
        return options.privateKey.empty()
          ? libssh2_userauth_password_ex(connection.session, options.username.data(), static_cast<unsigned>(options.username.size()), options.password.data(), static_cast<unsigned>(options.password.size()), nullptr)
          : libssh2_userauth_publickey_frommemory(connection.session, options.username.data(), options.username.size(), nullptr, 0, options.privateKey.data(), options.privateKey.size(), options.passphrase.c_str());
      });
      erase(options.password); erase(options.privateKey); erase(options.passphrase);
      if (auth != 0) throw Failure("authentication");
      int opened = retry(connection, state, deadline, [&] {
        connection.channel = libssh2_channel_open_session(connection.session);
        return connection.channel ? 0 : libssh2_session_last_errno(connection.session);
      });
      if (opened != 0) throw Failure("channel");
      check(state, deadline);
      // Once any exec request may have reached the peer, loss of its reply is unknown.
      remoteState = "unknown";
      const int executed = retry(connection, state, deadline, [&] { return libssh2_channel_exec(connection.channel, options.command.c_str()); });
      if (executed != 0) {
        if (executed == LIBSSH2_ERROR_CHANNEL_REQUEST_DENIED) remoteState = "not-started";
        throw Failure("command");
      }
      // This is a non-interactive command. EOF prevents commands waiting forever for stdin.
      if (retry(connection, state, deadline, [&] { return libssh2_channel_send_eof(connection.channel); }) != 0)
        throw Failure("connection");
      char buffer[16384];
      std::string pendingOutput[2];
      auto lastOutput = Clock::now();
      const auto flush = [&] {
        for (int stream = 0; stream < 2; ++stream) {
          if (pendingOutput[stream].empty()) continue;
          output(stream ? "stderr" : "stdout", base64(pendingOutput[stream].data(), pendingOutput[stream].size()));
          pendingOutput[stream].clear();
        }
        lastOutput = Clock::now();
      };
      while (true) {
        check(state, deadline);
        bool read = false;
        for (int stream = 0; stream < 2; ++stream) {
          const auto count = libssh2_channel_read_ex(connection.channel, stream, buffer, sizeof(buffer));
          if (count > 0) {
            read = true;
            const size_t available = maxOutput - out.size() - err.size();
            const size_t kept = std::min(available, static_cast<size_t>(count));
            if (kept) {
              (stream ? err : out).append(buffer, kept);
              pendingOutput[stream].append(buffer, kept);
            }
            if (kept < static_cast<size_t>(count)) truncated = true;
          } else if (count < 0 && count != LIBSSH2_ERROR_EAGAIN) throw Failure("connection");
        }
        if (pendingOutput[0].size() + pendingOutput[1].size() >= 16384 ||
            Clock::now() - lastOutput >= std::chrono::milliseconds(100)) flush();
        if (!read && libssh2_channel_eof(connection.channel)) break;
        if (!read) waitSocket(connection, state, deadline);
      }
      flush();
      if (retry(connection, state, deadline, [&] { return libssh2_channel_wait_closed(connection.channel); }) != 0)
        throw Failure("connection");
      hasExit = libssh2_channel_has_exit_status(connection.channel) == 1;
      if (hasExit) { exitCode = libssh2_channel_get_exit_status(connection.channel); remoteState = "exited"; }
    }
  } catch (const Failure &failure) {
    error = failure.what();
  } catch (...) { error = "unavailable"; }
  {
    std::lock_guard<std::mutex> guard(runsLock);
    runs.erase(id);
  }
  // Errors are fixed local codes, never peer-controlled strings or credentials.
  return "{\"state\":\"" + remoteState + "\",\"error\":\"" + error +
    "\",\"fingerprint\":\"" + fingerprint + "\",\"stdout\":\"" + base64(out.data(), out.size()) +
    "\",\"stderr\":\"" + base64(err.data(), err.size()) + "\",\"exitCode\":" +
    (hasExit ? std::to_string(exitCode) : "null") + ",\"truncated\":" + (truncated ? "true" : "false") + "}";
}
}
