#include <jni.h>
#include <utility>
#include "Ssh.h"
namespace {
std::string fromBytes(JNIEnv *env, jbyteArray bytes) {
  std::string result(env->GetArrayLength(bytes), '\0');
  env->GetByteArrayRegion(bytes, 0, static_cast<jsize>(result.size()), reinterpret_cast<jbyte *>(result.data()));
  return result;
}
jbyteArray toBytes(JNIEnv *env, const std::string &value) {
  auto result = env->NewByteArray(static_cast<jsize>(value.size()));
  if (result) env->SetByteArrayRegion(result, 0, static_cast<jsize>(value.size()), reinterpret_cast<const jbyte *>(value.data()));
  return result;
}
}
extern "C" JNIEXPORT jboolean JNICALL Java_expo_modules_ssh_SshNative_prepare(JNIEnv *env, jclass, jbyteArray id) {
  return cherry::ssh::prepare(fromBytes(env, id));
}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_ssh_SshNative_cancel(JNIEnv *env, jclass, jbyteArray id) {
  cherry::ssh::cancel(fromBytes(env, id));
}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_ssh_SshNative_cancelAll(JNIEnv *, jclass) {
  cherry::ssh::cancelAll();
}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_ssh_SshNative_closePool(JNIEnv *env, jclass, jbyteArray key) {
  cherry::ssh::closePool(fromBytes(env, key));
}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_ssh_SshNative_closeAll(JNIEnv *, jclass) { cherry::ssh::closeAll(); }
extern "C" JNIEXPORT jint JNICALL Java_expo_modules_ssh_SshNative_maintain(JNIEnv *, jclass) { return cherry::ssh::maintain(); }
extern "C" JNIEXPORT void JNICALL Java_expo_modules_ssh_SshNative_respond(JNIEnv *env, jclass, jbyteArray id, jbyteArray challenge, jobjectArray responses) {
  std::vector<std::string> values;
  for (jsize i = 0; i < env->GetArrayLength(responses); ++i) {
    auto bytes = static_cast<jbyteArray>(env->GetObjectArrayElement(responses, i));
    values.push_back(fromBytes(env, bytes));
    env->DeleteLocalRef(bytes);
  }
  cherry::ssh::respond(fromBytes(env, id), fromBytes(env, challenge), values);
}
extern "C" JNIEXPORT jbyteArray JNICALL Java_expo_modules_ssh_SshNative_run(JNIEnv *env, jclass, jbyteArray id, jobjectArray strings, jint port, jint timeout, jboolean probe, jboolean overwrite, jobject output) {
  auto get = [&](int index) {
    auto bytes = static_cast<jbyteArray>(env->GetObjectArrayElement(strings, index));
    auto result = fromBytes(env, bytes);
    env->DeleteLocalRef(bytes);
    return result;
  };
  cherry::ssh::Options options;
  options.host = get(0); options.username = get(1); options.fingerprint = get(2);
  options.password = get(3); options.privateKey = get(4); options.passphrase = get(5); options.command = get(6);
  options.cwd = get(7); options.input = get(8); options.directory = get(9); options.poolKey = get(10);
  options.operation = get(11); options.path = get(12); options.localPath = get(13); options.content = get(14);
  options.port = port; options.timeoutMs = timeout; options.probe = probe;
  options.overwrite = overwrite;
  auto sinkClass = env->GetObjectClass(output);
  auto emit = env->GetMethodID(sinkClass, "emit", "([B[B)V");
  auto result = cherry::ssh::run(fromBytes(env, id), std::move(options), [&](const auto &stream, const auto &data) {
    auto streamBytes = toBytes(env, stream);
    auto dataBytes = toBytes(env, data);
    env->CallVoidMethod(output, emit, streamBytes, dataBytes);
    env->DeleteLocalRef(streamBytes); env->DeleteLocalRef(dataBytes);
    if (env->ExceptionCheck()) env->ExceptionClear();
  });
  env->DeleteLocalRef(sinkClass);
  return toBytes(env, result);
}
