#pragma once
#include <functional>
#include <string>

namespace cherry::ssh {
struct Options {
  std::string host, username, fingerprint, password, privateKey, passphrase, command;
  int port = 22;
  int timeoutMs = 60000;
  bool probe = false;
};
// Prepare synchronously before scheduling work, so cancellation cannot miss a run.
bool prepare(const std::string &id);
void cancel(const std::string &id);
void cancelAll();
// ASCII JSON and base64 payloads preserve arbitrary output bytes across both bridges.
using Output = std::function<void(const std::string &stream, const std::string &base64)>;
std::string run(const std::string &id, Options options, const Output &output);
}
