#pragma once
#include <functional>
#include <string>
#include <vector>

namespace cherry::ssh {
struct Options {
  std::string host, username, fingerprint, password, privateKey, passphrase, command;
  std::string cwd, input, directory, poolKey, path, localPath, content;
  std::string operation = "exec";
  int port = 22;
  int timeoutMs = 60000;
  bool probe = false;
  bool overwrite = false;
};
// Prepare synchronously before scheduling work, so cancellation cannot miss a run.
bool prepare(const std::string &id);
void cancel(const std::string &id);
void cancelAll();
void respond(const std::string &id, const std::string &challenge, const std::vector<std::string> &responses);
void closePool(const std::string &key);
void closeAll();
int maintain();
// ASCII JSON and base64 payloads preserve arbitrary output bytes across both bridges.
using Output = std::function<void(const std::string &stream, const std::string &base64)>;
std::string run(const std::string &id, Options options, const Output &output);
}
