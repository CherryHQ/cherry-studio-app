#include "Ssh.h"
#include <libssh2.h>
#include <libssh2_sftp.h>
#include <openssl/crypto.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cerrno>
#include <condition_variable>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <fcntl.h>
#include <map>
#include <memory>
#include <mutex>
#include <netdb.h>
#include <poll.h>
#include <stdexcept>
#include <sys/socket.h>
#include <sys/stat.h>
#include <thread>
#include <utility>
#include <unistd.h>
#include <vector>

namespace cherry::ssh {
namespace {
using Clock = std::chrono::steady_clock;
constexpr size_t maxOutput = 256 * 1024;
constexpr size_t maxTransfer = 20 * 1024 * 1024;
struct Run {
  std::atomic<bool> cancelled{false};
  bool started = false;
  std::mutex authLock;
  std::condition_variable authChanged;
  std::string challenge;
  std::vector<std::string> responses;
  bool answered = false;
};
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
  LIBSSH2_SFTP *sftp = nullptr;
  LIBSSH2_SFTP_HANDLE *file = nullptr;
  std::string fingerprint;
  ~Connection() {
    // Shutdown makes cleanup finite even if the peer stopped responding.
    if (socket >= 0) shutdown(socket, SHUT_RDWR);
    if (session) {
      libssh2_session_set_blocking(session, 0);
      if (file) libssh2_sftp_close_handle(file);
      if (sftp) libssh2_sftp_shutdown(sftp);
      if (channel) libssh2_channel_free(channel);
      libssh2_session_free(session);
    }
    if (socket >= 0) close(socket);
  }
};

void waitSocket(Connection &connection, const std::shared_ptr<Run> &run,
                Clock::time_point deadline, int blockedDirections = 0) {
  check(run, deadline);
  int directions = blockedDirections | (connection.session ? libssh2_session_block_directions(connection.session) : 0);
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
          const Clock::time_point &deadline, F operation) {
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

// Only a leased entry may touch libssh2 handles. Idle maintenance takes the same
// lease; neither a second operation nor the JS thread shares a session's I/O.
struct PooledConnection {
  Connection connection;
  std::string identity;
  bool leased = false;
  Clock::time_point lastUsed = Clock::now();
};
std::mutex poolLock;
std::map<std::string, std::shared_ptr<PooledConnection>> pool;

struct ConnectionLease {
  std::string key;
  std::shared_ptr<PooledConnection> entry;
  bool healthy = false;
  bool userActivity = true;
  ~ConnectionLease() {
    std::lock_guard<std::mutex> guard(poolLock);
    auto found = pool.find(key);
    if (found == pool.end() || found->second != entry) return;
    if (!healthy) pool.erase(found);
    else {
      entry->leased = false;
      if (userActivity) entry->lastUsed = Clock::now();
    }
  }
};

std::shared_ptr<PooledConnection> acquire(const Options &options) {
  const auto identity = options.host + "\n" + std::to_string(options.port) + "\n" +
    options.username + "\n" + options.fingerprint;
  std::lock_guard<std::mutex> guard(poolLock);
  auto found = pool.find(options.poolKey);
  if (found != pool.end()) {
    auto entry = found->second;
    if (entry->leased) throw Failure("busy");
    if (entry->identity == identity && Clock::now() - entry->lastUsed < std::chrono::minutes(5)) {
      entry->leased = true;
      return entry;
    }
    pool.erase(found);
  }
  if (pool.size() >= 4) {
    auto oldest = pool.end();
    for (auto item = pool.begin(); item != pool.end(); ++item)
      if (!item->second->leased && (oldest == pool.end() || item->second->lastUsed < oldest->second->lastUsed)) oldest = item;
    if (oldest == pool.end()) throw Failure("busy");
    pool.erase(oldest);
  }
  auto entry = std::make_shared<PooledConnection>();
  entry->identity = identity;
  entry->leased = true;
  pool[options.poolKey] = entry;
  return entry;
}

// JSON is ASCII; arbitrary remote text is base64 and decoded only at the owned JS boundary.
std::string encoded(const std::string &value) { return "\"" + base64(value.data(), value.size()) + "\""; }
std::string shellQuote(const std::string &value) {
  std::string result = "'";
  for (char c : value) result += c == '\'' ? "'\\''" : std::string(1, c);
  return result + "'";
}
bool validText(const std::string &value, size_t maximum) {
  return value.size() <= maximum && value.find('\0') == std::string::npos;
}

struct Authentication {
  std::shared_ptr<Run> run;
  const Output &output;
  Clock::time_point &deadline;
  Clock::time_point &connectDeadline;
  int round = 0;
  std::chrono::milliseconds waited{0};
  std::string error;
};

void keyboardInteractive(const char *name, int nameLength, const char *instruction,
                         int instructionLength, int count,
                         const LIBSSH2_USERAUTH_KBDINT_PROMPT *prompts,
                         LIBSSH2_USERAUTH_KBDINT_RESPONSE *responses, void **abstract) {
  auto &auth = *static_cast<Authentication *>(*abstract);
  try {
    if (count == 0) return;
    if (++auth.round > 4 || count < 0 || count > 8 || nameLength < 0 || nameLength > 1024 ||
        instructionLength < 0 || instructionLength > 4096) throw Failure("authentication-required");
    auto challenge = std::to_string(auth.round);
    std::string message = "{\"challenge\":\"" + challenge + "\",\"name\":" +
      encoded(std::string(name ? name : "", nameLength)) + ",\"instruction\":" +
      encoded(std::string(instruction ? instruction : "", instructionLength)) + ",\"prompts\":[";
    for (int i = 0; i < count; ++i) {
      if (prompts[i].length > 1024) throw Failure("authentication-required");
      if (i) message += ',';
      message += "{\"text\":" + encoded(std::string(prompts[i].text, prompts[i].length)) +
        ",\"echo\":" + (prompts[i].echo ? "true" : "false") + "}";
    }
    const auto remaining = std::chrono::milliseconds(120000) - auth.waited;
    if (remaining.count() <= 0) throw Failure("timeout");
    message += "],\"waitMs\":" + std::to_string(remaining.count()) + "}";
    {
      std::lock_guard<std::mutex> guard(auth.run->authLock);
      auth.run->challenge = challenge;
      auth.run->answered = false;
    }
    const auto started = Clock::now();
    auth.output("authentication", base64(message.data(), message.size()));
    std::unique_lock<std::mutex> lock(auth.run->authLock);
    while (!auth.run->answered) {
      check(auth.run, started + remaining);
      auth.run->authChanged.wait_for(lock, std::chrono::milliseconds(100));
    }
    check(auth.run, started + remaining);
    if (auth.run->responses.size() != static_cast<size_t>(count)) throw Failure("authentication-required");
    for (int i = 0; i < count; ++i) {
      auto &answer = auth.run->responses[i];
      responses[i].text = static_cast<char *>(std::malloc(answer.size() + 1));
      if (!responses[i].text) throw Failure("unavailable");
      std::memcpy(responses[i].text, answer.data(), answer.size());
      responses[i].text[answer.size()] = '\0';
      responses[i].length = static_cast<unsigned>(answer.size());
      erase(answer);
    }
    auth.run->responses.clear();
    auth.run->challenge.clear();
    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - started);
    auth.waited += elapsed;
    auth.deadline += elapsed;
    auth.connectDeadline += elapsed;
  } catch (const Failure &failure) { auth.error = failure.what(); }
    catch (...) { auth.error = "authentication-required"; }
}

struct FileResult {
  std::string path, entries = "[]", content;
  size_t bytes = 0;
  bool truncated = false;
  bool temporaryCreated = false;
};
std::string sftpError(Connection &connection) {
  if (libssh2_session_last_errno(connection.session) != LIBSSH2_ERROR_SFTP_PROTOCOL) return "sftp";
  switch (libssh2_sftp_last_error(connection.sftp)) {
    case LIBSSH2_FX_NO_SUCH_FILE: case LIBSSH2_FX_NO_SUCH_PATH: return "not-found";
    case LIBSSH2_FX_PERMISSION_DENIED: return "permission";
    case LIBSSH2_FX_FILE_ALREADY_EXISTS: return "file-exists";
    default: return "sftp";
  }
}
std::string canonicalPath(Connection &connection, const std::string &path,
                          const std::shared_ptr<Run> &run, Clock::time_point deadline) {
  char buffer[4097];
  const int size = retry(connection, run, deadline, [&] {
    return libssh2_sftp_realpath(connection.sftp, path.c_str(), buffer, sizeof(buffer));
  });
  if (size <= 0 || size > 4096) throw Failure(size < 0 ? sftpError(connection) : "path");
  std::string result(buffer, size);
  if (result.front() != '/' || !validText(result, 4096)) throw Failure("path");
  while (result.size() > 1 && result.back() == '/') result.pop_back();
  return result;
}
bool withinRoot(const std::string &root, const std::string &path) {
  return root == "/" || path == root || path.starts_with(root + "/");
}
void closeFile(Connection &connection, const std::shared_ptr<Run> &run, Clock::time_point deadline) {
  // libssh2 frees the handle on every terminal return, including protocol errors.
  if (retry(connection, run, deadline, [&] {
      const int status = libssh2_sftp_close_handle(connection.file);
      if (status != LIBSSH2_ERROR_EAGAIN) connection.file = nullptr;
      return status;
    }) != 0)
    throw Failure(sftpError(connection));
}
void openFile(Connection &connection, const std::string &path, unsigned long flags,
              int type, const std::shared_ptr<Run> &run, Clock::time_point deadline) {
  if (retry(connection, run, deadline, [&] {
      connection.file = libssh2_sftp_open_ex(connection.sftp, path.c_str(), static_cast<unsigned>(path.size()), flags, 0600, type);
      return connection.file ? 0 : libssh2_session_last_errno(connection.session);
    }) != 0) throw Failure(sftpError(connection));
}
void fileProgress(const Output &output, size_t transferred, long long total) {
  const auto message = "{\"transferred\":" + std::to_string(transferred) + ",\"total\":" +
    (total < 0 ? "null" : std::to_string(total)) + "}";
  output("progress", base64(message.data(), message.size()));
}

void fileOperation(Connection &connection, const Options &options, const std::string &id,
                   const std::shared_ptr<Run> &run, Clock::time_point deadline,
                   const Output &output, FileResult &result, std::string &remoteState,
                   std::string &temporaryPath) {
  if (retry(connection, run, deadline, [&] {
      connection.sftp = libssh2_sftp_init(connection.session);
      return connection.sftp ? 0 : libssh2_session_last_errno(connection.session);
    }) != 0) throw Failure("sftp");
  const auto root = canonicalPath(connection, options.directory.empty() ? "." : options.directory, run, deadline);
  const bool writing = options.operation == "write" || options.operation == "upload";
  // File paths are relative to the configured workspace. Resolve symlinks before
  // use; this is a product scope, not a replacement for server account permissions.
  if (options.path.front() == '/') throw Failure("path");
  const auto candidate = root + (root == "/" ? "" : "/") + options.path;
  LIBSSH2_SFTP_ATTRIBUTES previous{};
  bool existed = false;
  if (writing) {
    auto slash = candidate.find_last_of('/');
    auto name = candidate.substr(slash + 1);
    if (name.empty() || name == "." || name == "..") throw Failure("path");
    const auto parent = canonicalPath(connection, candidate.substr(0, slash).empty() ? "/" : candidate.substr(0, slash), run, deadline);
    result.path = parent + (parent == "/" ? "" : "/") + name;
    if (!withinRoot(root, result.path) || result.path.size() > 4096) throw Failure("path");
    const int status = retry(connection, run, deadline, [&] { return libssh2_sftp_lstat(connection.sftp, result.path.c_str(), &previous); });
    existed = status == 0;
    if (status < 0 && sftpError(connection) != "not-found") throw Failure(sftpError(connection));
    if (existed && (!options.overwrite || !LIBSSH2_SFTP_S_ISREG(previous.permissions)))
      throw Failure(options.overwrite ? "path" : "file-exists");
  } else {
    result.path = canonicalPath(connection, candidate, run, deadline);
    if (!withinRoot(root, result.path)) throw Failure("path");
  }
  if (options.operation == "list") {
    openFile(connection, result.path, 0, LIBSSH2_SFTP_OPENDIR, run, deadline);
    std::string entriesJson = "[";
    size_t entries = 0, retained = 0;
    while (true) {
      char name[4097];
      LIBSSH2_SFTP_ATTRIBUTES attributes{};
      const int count = retry(connection, run, deadline, [&] { return libssh2_sftp_readdir_ex(connection.file, name, sizeof(name), nullptr, 0, &attributes); });
      if (count < 0) throw Failure(sftpError(connection));
      if (count == 0) break;
      std::string filename(name, count);
      if (filename == "." || filename == "..") continue;
      if (!validText(filename, 4096) || filename.find('/') != std::string::npos) continue;
      if (entries >= 500 || retained + filename.size() > maxOutput) { result.truncated = true; break; }
      if (entries++) entriesJson += ',';
      retained += filename.size();
      const auto mode = attributes.permissions;
      auto type = !(attributes.flags & LIBSSH2_SFTP_ATTR_PERMISSIONS) ? "other" :
        LIBSSH2_SFTP_S_ISDIR(mode) ? "directory" : LIBSSH2_SFTP_S_ISREG(mode) ? "file" : LIBSSH2_SFTP_S_ISLNK(mode) ? "symlink" : "other";
      if (LIBSSH2_SFTP_S_ISLNK(mode)) {
        LIBSSH2_SFTP_ATTRIBUTES target{};
        const auto child = result.path + (result.path == "/" ? "" : "/") + filename;
        if (retry(connection, run, deadline, [&] { return libssh2_sftp_stat(connection.sftp, child.c_str(), &target); }) == 0 &&
            (target.flags & LIBSSH2_SFTP_ATTR_PERMISSIONS) && LIBSSH2_SFTP_S_ISDIR(target.permissions))
          type = "directory";
        // Navigation still canonicalizes the target and rejects paths outside root.
      }
      entriesJson += "{\"name\":" + encoded(filename) + ",\"type\":\"" + type + "\",\"size\":" +
        ((attributes.flags & LIBSSH2_SFTP_ATTR_SIZE) ? std::to_string(attributes.filesize) : "null") +
        ",\"modifiedAt\":" + ((attributes.flags & LIBSSH2_SFTP_ATTR_ACMODTIME) ? std::to_string(static_cast<unsigned long long>(attributes.mtime) * 1000) : "null") + "}";
    }
    result.entries = entriesJson + ']';
    closeFile(connection, run, deadline);
  } else if (!writing) {
    openFile(connection, result.path, LIBSSH2_FXF_READ, LIBSSH2_SFTP_OPENFILE, run, deadline);
    LIBSSH2_SFTP_ATTRIBUTES attributes{};
    if (retry(connection, run, deadline, [&] { return libssh2_sftp_fstat(connection.file, &attributes); }) != 0) throw Failure(sftpError(connection));
    if (!(attributes.flags & LIBSSH2_SFTP_ATTR_PERMISSIONS) || !LIBSSH2_SFTP_S_ISREG(attributes.permissions)) throw Failure("path");
    const auto limit = options.operation == "read" ? maxOutput : maxTransfer;
    if ((attributes.flags & LIBSSH2_SFTP_ATTR_SIZE) && attributes.filesize > limit) throw Failure("file-too-large");
    std::unique_ptr<FILE, decltype(&std::fclose)> local(nullptr, &std::fclose);
    if (options.operation == "download") {
      // The backend supplies an owned, unique cache path, never model input.
      int fd = ::open(options.localPath.c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600);
      if (fd < 0) throw Failure("local-file");
      local.reset(fdopen(fd, "wb"));
      if (!local) { close(fd); throw Failure("local-file"); }
    }
    char bytes[32768];
    auto lastProgress = Clock::now();
    while (true) {
      const int count = retry(connection, run, deadline, [&] { return static_cast<int>(libssh2_sftp_read(connection.file, bytes, sizeof(bytes))); });
      if (count < 0) throw Failure(sftpError(connection));
      if (count == 0) break;
      result.bytes += static_cast<size_t>(count);
      if (result.bytes > limit) throw Failure("file-too-large");
      if (local) {
        if (std::fwrite(bytes, 1, count, local.get()) != static_cast<size_t>(count)) throw Failure("local-file");
      } else result.content.append(bytes, count);
      if (Clock::now() - lastProgress >= std::chrono::milliseconds(100)) {
        fileProgress(output, result.bytes, attributes.flags & LIBSSH2_SFTP_ATTR_SIZE ? static_cast<long long>(attributes.filesize) : -1);
        lastProgress = Clock::now();
      }
    }
    if (local && std::fflush(local.get()) != 0) throw Failure("local-file");
    closeFile(connection, run, deadline);
    fileProgress(output, result.bytes, result.bytes);
  } else {
    std::unique_ptr<FILE, decltype(&std::fclose)> local(nullptr, &std::fclose);
    size_t total = options.content.size();
    if (options.operation == "upload") {
      local.reset(std::fopen(options.localPath.c_str(), "rb"));
      if (!local) throw Failure("local-file");
      struct stat attributes{};
      if (fstat(fileno(local.get()), &attributes) != 0 || !S_ISREG(attributes.st_mode) || attributes.st_size < 0) throw Failure("local-file");
      total = static_cast<size_t>(attributes.st_size);
    }
    if (total > maxTransfer) throw Failure("file-too-large");
    temporaryPath = result.path + ".cherry-" + id;
    remoteState = "unknown";
    openFile(connection, temporaryPath, LIBSSH2_FXF_WRITE | LIBSSH2_FXF_CREAT | LIBSSH2_FXF_EXCL, LIBSSH2_SFTP_OPENFILE, run, deadline);
    result.temporaryCreated = true;
    char bytes[32768];
    auto lastProgress = Clock::now();
    while (result.bytes < total) {
      const size_t count = std::min(sizeof(bytes), total - result.bytes);
      if (local) {
        if (std::fread(bytes, 1, count, local.get()) != count) throw Failure("local-file");
      } else std::memcpy(bytes, options.content.data() + result.bytes, count);
      size_t offset = 0;
      while (offset < count) {
        const int written = retry(connection, run, deadline, [&] { return static_cast<int>(libssh2_sftp_write(connection.file, bytes + offset, count - offset)); });
        if (written <= 0) throw Failure(sftpError(connection));
        offset += written;
      }
      result.bytes += count;
      if (Clock::now() - lastProgress >= std::chrono::milliseconds(100)) {
        fileProgress(output, result.bytes, total);
        lastProgress = Clock::now();
      }
    }
    if (existed && (previous.flags & LIBSSH2_SFTP_ATTR_PERMISSIONS)) {
      LIBSSH2_SFTP_ATTRIBUTES permissions{};
      permissions.flags = LIBSSH2_SFTP_ATTR_PERMISSIONS;
      permissions.permissions = previous.permissions & 0777;
      if (retry(connection, run, deadline, [&] { return libssh2_sftp_fsetstat(connection.file, &permissions); }) != 0) throw Failure(sftpError(connection));
    }
    closeFile(connection, run, deadline);
    // SFTP v3 ignores rename flags. OpenSSH's explicit extension is required
    // for atomic replacement; an unsupported server must fail without unlinking.
    if (retry(connection, run, deadline, [&] {
        return options.overwrite
          ? libssh2_sftp_posix_rename_ex(connection.sftp, temporaryPath.c_str(), temporaryPath.size(), result.path.c_str(), result.path.size())
          : libssh2_sftp_rename_ex(connection.sftp, temporaryPath.c_str(), static_cast<unsigned>(temporaryPath.size()), result.path.c_str(), static_cast<unsigned>(result.path.size()), 0);
      }) != 0) throw Failure(sftpError(connection));
    temporaryPath.clear();
    fileProgress(output, result.bytes, total);
  }
  remoteState = "completed";
}
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
    found->second->authChanged.notify_all();
    if (!found->second->started) runs.erase(found);
  }
}
void cancelAll() {
  std::lock_guard<std::mutex> guard(runsLock);
  for (auto item = runs.begin(); item != runs.end();) {
    item->second->cancelled = true;
    item->second->authChanged.notify_all();
    if (!item->second->started) item = runs.erase(item);
    else ++item;
  }
}

void respond(const std::string &id, const std::string &challenge, const std::vector<std::string> &responses) {
  std::shared_ptr<Run> state;
  {
    std::lock_guard<std::mutex> guard(runsLock);
    auto found = runs.find(id);
    if (found == runs.end()) return;
    state = found->second;
  }
  if (responses.size() > 8) return;
  for (const auto &response : responses) if (!validText(response, 4096)) return;
  std::lock_guard<std::mutex> guard(state->authLock);
  if (state->cancelled || state->challenge != challenge || state->answered) return;
  state->responses = responses;
  state->answered = true;
  state->authChanged.notify_all();
}
void closePool(const std::string &key) {
  std::shared_ptr<PooledConnection> retired;
  {
    std::lock_guard<std::mutex> guard(poolLock);
    auto found = pool.find(key);
    if (found != pool.end()) { retired = found->second; pool.erase(found); }
  }
}
void closeAll() {
  std::map<std::string, std::shared_ptr<PooledConnection>> retired;
  { std::lock_guard<std::mutex> guard(poolLock); retired.swap(pool); }
}
int maintain() {
  std::vector<std::pair<std::string, std::shared_ptr<PooledConnection>>> idle;
  {
    std::lock_guard<std::mutex> guard(poolLock);
    for (auto &item : pool) if (!item.second->leased) {
      item.second->leased = true;
      idle.push_back(item);
    }
  }
  for (const auto &[key, entry] : idle) {
    ConnectionLease lease{key, entry};
    lease.userActivity = false;
    if (Clock::now() - entry->lastUsed >= std::chrono::minutes(5)) continue;
    auto &connection = entry->connection;
    if (!connection.session) continue;
    int next = 0;
    // Never leave a half-written maintenance packet for another caller.
    // A heartbeat is not user activity and must not extend idle lifetime.
    lease.healthy = libssh2_keepalive_send(connection.session, &next) == 0;
  }
  std::lock_guard<std::mutex> guard(poolLock);
  return static_cast<int>(pool.size());
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
  std::string remoteState = "not-started", error, fingerprint, out, err, temporaryPath;
  std::string phase = "connect", kex, cipher, authMethods;
  bool truncated = false, hasExit = false, reused = false;
  int exitCode = 0, nativeCode = 0, hostKeyType = 0;
  FileResult file;
  std::unique_ptr<ConnectionLease> lease;
  std::unique_ptr<Connection> probeConnection;
  Connection *connection = nullptr;
  try {
    if (options.host.empty() || !validText(options.host, 253) || options.port < 1 || options.port > 65535 ||
        !validText(options.username, 256) || !validText(options.password, 65536) ||
        !validText(options.privateKey, 65536) || !validText(options.passphrase, 65536) ||
        !validText(options.command, 32768) || !validText(options.input, maxOutput) ||
        !validText(options.cwd, 4096) || !validText(options.directory, 4096) ||
        !validText(options.path, 4096) || !validText(options.localPath, 8192) ||
        !validText(options.content, maxOutput) || !validText(options.poolKey, 200) ||
        (!options.probe && options.poolKey.empty()) ||
        (!options.probe && options.operation == "exec" && options.command.empty()) ||
        (!options.probe && options.operation != "exec" && options.path.empty()) ||
        (options.operation != "exec" && options.operation != "list" && options.operation != "read" &&
         options.operation != "write" && options.operation != "upload" && options.operation != "download"))
      throw Failure("invalid-input");
    std::call_once(initialization, [] { initResult = libssh2_init(0); });
    if (initResult != 0) throw Failure("unavailable");
    auto deadline = Clock::now() + std::chrono::milliseconds(std::clamp(options.timeoutMs, 1000, 600000));
    auto connectionDeadline = std::min(deadline, Clock::now() + std::chrono::seconds(20));
    check(state, deadline);
    if (options.probe) {
      probeConnection = std::make_unique<Connection>();
      connection = probeConnection.get();
    } else {
      auto entry = acquire(options);
      lease = std::make_unique<ConnectionLease>();
      lease->key = options.poolKey;
      lease->entry = entry;
      connection = &entry->connection;
    }
    auto &conn = *connection;
    reused = conn.session != nullptr;
    if (!reused) {
      connect(conn, options, state, connectionDeadline);
      conn.session = libssh2_session_init();
      if (!conn.session) throw Failure("unavailable");
      libssh2_session_set_blocking(conn.session, 0);
      libssh2_session_flag(conn.session, LIBSSH2_FLAG_SIGPIPE, 0);
      phase = "handshake";
      if (retry(conn, state, connectionDeadline, [&] { return libssh2_session_handshake(conn.session, conn.socket); }) != 0)
        throw Failure("handshake");
      const char *hash = libssh2_hostkey_hash(conn.session, LIBSSH2_HOSTKEY_HASH_SHA256);
      if (!hash) throw Failure("handshake");
      conn.fingerprint = "SHA256:" + base64(hash, 32);
      while (conn.fingerprint.back() == '=') conn.fingerprint.pop_back();
    }
    fingerprint = conn.fingerprint;
    size_t keyLength = 0;
    libssh2_session_hostkey(conn.session, &keyLength, &hostKeyType);
    const auto method = [&](int type) {
      const char *value = libssh2_session_methods(conn.session, type);
      return value ? std::string(value).substr(0, 128) : std::string();
    };
    kex = method(LIBSSH2_METHOD_KEX);
    cipher = method(LIBSSH2_METHOD_CRYPT_CS);
    if (options.probe) remoteState = "probed";
    else {
      // A pooled session is tied to this exact revision, endpoint and trusted key.
      if (options.fingerprint != fingerprint) throw Failure("host-key");
      phase = "authentication";
      if (!reused) {
        const auto listMethods = [&] {
          char *methods = nullptr;
          const int result = retry(conn, state, connectionDeadline, [&] {
            methods = libssh2_userauth_list(conn.session, options.username.data(), static_cast<unsigned>(options.username.size()));
            return methods || libssh2_userauth_authenticated(conn.session) ? 0 : libssh2_session_last_errno(conn.session);
          });
          if (result == 0 && methods) authMethods = std::string(methods).substr(0, 256);
        };
        listMethods();
        int authenticated = libssh2_userauth_authenticated(conn.session) ? 0 : retry(conn, state, connectionDeadline, [&] {
          return options.privateKey.empty()
            ? libssh2_userauth_password_ex(conn.session, options.username.data(), static_cast<unsigned>(options.username.size()), options.password.data(), static_cast<unsigned>(options.password.size()), nullptr)
            : libssh2_userauth_publickey_frommemory(conn.session, options.username.data(), options.username.size(), nullptr, 0, options.privateKey.data(), options.privateKey.size(), options.passphrase.c_str());
        });
        if (authenticated != 0) {
          listMethods();
          if (authMethods.find("keyboard-interactive") != std::string::npos) {
            Authentication auth{state, output, deadline, connectionDeadline};
            *libssh2_session_abstract(conn.session) = &auth;
            // The callback must not throw across the C API. Clear the stack pointer
            // before a connection can be retained, including a cancellation path.
            try {
              authenticated = retry(conn, state, connectionDeadline, [&] {
                return libssh2_userauth_keyboard_interactive_ex(conn.session, options.username.data(), static_cast<unsigned>(options.username.size()), keyboardInteractive);
              });
            } catch (...) { *libssh2_session_abstract(conn.session) = nullptr; throw; }
            *libssh2_session_abstract(conn.session) = nullptr;
            if (!auth.error.empty()) throw Failure(auth.error);
          }
        }
        if (authenticated != 0 || !libssh2_userauth_authenticated(conn.session)) throw Failure("authentication");
        libssh2_keepalive_config(conn.session, 1, 15);
      }
      erase(options.password); erase(options.privateKey); erase(options.passphrase);
      if (options.operation == "exec") {
        phase = "command";
        if (retry(conn, state, deadline, [&] {
            conn.channel = libssh2_channel_open_session(conn.session);
            return conn.channel ? 0 : libssh2_session_last_errno(conn.session);
          }) != 0) throw Failure("channel");
        check(state, deadline);
        std::string directory = options.cwd.empty() ? options.directory : options.cwd;
        if (!options.cwd.empty() && options.cwd.front() != '/' && !options.directory.empty() && options.directory != ".")
          directory = options.directory + "/" + options.cwd;
        if (!directory.empty() && directory.front() != '/' && directory != ".") directory = "./" + directory;
        const auto command = directory.empty() || directory == "." ? options.command :
          "cd " + shellQuote(directory) + " && (\n" + options.command + "\n)";
        remoteState = "unknown";
        const int executed = retry(conn, state, deadline, [&] { return libssh2_channel_exec(conn.channel, command.c_str()); });
        if (executed != 0) {
          if (executed == LIBSSH2_ERROR_CHANNEL_REQUEST_DENIED) remoteState = "not-started";
          throw Failure("command");
        }
        // Drain output while sending stdin: writing all input first can deadlock
        // against a remote process that fills stdout before consuming its input.
        size_t inputOffset = 0;
        bool sentEof = false;
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
          bool progressed = false;
          int blockedDirections = 0;
          if (inputOffset < options.input.size()) {
            const auto count = libssh2_channel_write(conn.channel, options.input.data() + inputOffset, std::min<size_t>(16384, options.input.size() - inputOffset));
            if (count > 0) { inputOffset += count; progressed = true; }
            else if (count < 0 && count != LIBSSH2_ERROR_EAGAIN) throw Failure("connection");
            if (count == LIBSSH2_ERROR_EAGAIN) blockedDirections |= libssh2_session_block_directions(conn.session);
          } else if (!sentEof) {
            const int status = libssh2_channel_send_eof(conn.channel);
            if (status == 0) { sentEof = true; progressed = true; }
            else if (status != LIBSSH2_ERROR_EAGAIN) throw Failure("connection");
            if (status == LIBSSH2_ERROR_EAGAIN) blockedDirections |= libssh2_session_block_directions(conn.session);
          }
          for (int stream = 0; stream < 2; ++stream) {
            const auto count = libssh2_channel_read_ex(conn.channel, stream, buffer, sizeof(buffer));
            if (count > 0) {
              progressed = true;
              auto &retained = stream ? err : out;
              // Keep a bounded head and tail per stream, including failures printed last.
              const size_t kept = std::min(maxOutput / 2 - retained.size(), static_cast<size_t>(count));
              if (kept) pendingOutput[stream].append(buffer, kept);
              retained.append(buffer, static_cast<size_t>(count));
              if (retained.size() > maxOutput / 2) {
                retained.erase(maxOutput / 4, retained.size() - maxOutput / 2);
                truncated = true;
              }
            } else if (count < 0 && count != LIBSSH2_ERROR_EAGAIN) throw Failure("connection");
            if (count == LIBSSH2_ERROR_EAGAIN) blockedDirections |= libssh2_session_block_directions(conn.session);
          }
          if (pendingOutput[0].size() + pendingOutput[1].size() >= 16384 || Clock::now() - lastOutput >= std::chrono::milliseconds(100)) flush();
          if (!progressed && libssh2_channel_eof(conn.channel)) break;
          if (!progressed) waitSocket(conn, state, deadline, blockedDirections);
        }
        flush();
        if (retry(conn, state, deadline, [&] { return libssh2_channel_wait_closed(conn.channel); }) != 0) throw Failure("connection");
        hasExit = libssh2_channel_has_exit_status(conn.channel) == 1;
        if (hasExit) { exitCode = libssh2_channel_get_exit_status(conn.channel); remoteState = "exited"; }
        if (retry(conn, state, deadline, [&] { return libssh2_channel_free(conn.channel); }) != 0) throw Failure("connection");
        conn.channel = nullptr;
      } else {
        phase = options.operation == "upload" || options.operation == "download" ? "transfer" : "sftp";
        fileOperation(conn, options, id, state, deadline, output, file, remoteState, temporaryPath);
        if (retry(conn, state, deadline, [&] { return libssh2_sftp_shutdown(conn.sftp); }) != 0) throw Failure("connection");
        conn.sftp = nullptr;
      }
      check(state, deadline);
      lease->healthy = true;
    }
  } catch (const Failure &failure) { error = failure.what(); }
    catch (...) { error = "unavailable"; }
  if (connection && connection->session && !error.empty()) {
    nativeCode = libssh2_session_last_errno(connection->session);
    // Best-effort removal of an unpublished upload. A lost connection can leave
    // the uniquely named staging file; never retry or delete the destination.
    if (file.temporaryCreated && !temporaryPath.empty() && connection->sftp) {
      auto cleanup = std::make_shared<Run>();
      try { retry(*connection, cleanup, Clock::now() + std::chrono::milliseconds(300), [&] {
        return libssh2_sftp_unlink(connection->sftp, temporaryPath.c_str());
      }); } catch (...) {}
    }
  }
  {
    std::lock_guard<std::mutex> guard(state->authLock);
    for (auto &response : state->responses) erase(response);
    state->responses.clear(); state->challenge.clear();
  }
  { std::lock_guard<std::mutex> guard(runsLock); runs.erase(id); }
  // The last confirmed outcome survives a cleanup failure; no operation is replayed.
  return "{\"state\":\"" + remoteState + "\",\"error\":\"" + error +
    "\",\"fingerprint\":\"" + fingerprint + "\",\"stdout\":" + encoded(out) +
    ",\"stderr\":" + encoded(err) + ",\"exitCode\":" + (hasExit ? std::to_string(exitCode) : "null") +
    ",\"truncated\":" + (truncated || file.truncated ? "true" : "false") +
    ",\"path\":" + encoded(file.path) + ",\"entries\":" + file.entries +
    ",\"content\":" + encoded(file.content) + ",\"bytes\":" + std::to_string(file.bytes) +
    ",\"diagnostics\":{\"phase\":\"" + phase + "\",\"code\":" + std::to_string(nativeCode) +
    ",\"hostKeyType\":" + std::to_string(hostKeyType) + ",\"keyExchange\":" + encoded(kex) +
    ",\"cipher\":" + encoded(cipher) + ",\"authenticationMethods\":" + encoded(authMethods) +
    ",\"reused\":" + (reused ? "true" : "false") + "}}";
}
}
