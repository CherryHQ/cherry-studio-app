#include <jni.h>

#include <string>
#include <stdexcept>

#include "JsSandbox.h"

namespace {

// Strings cross JNI as UTF-8 byte arrays: JNI's own "UTF" is modified UTF-8,
// which splits characters outside the Basic Multilingual Plane.
std::string fromBytes(JNIEnv *env, jbyteArray bytes) {
  const jsize length = env->GetArrayLength(bytes);
  std::string value(static_cast<size_t>(length), '\0');
  env->GetByteArrayRegion(bytes, 0, length, reinterpret_cast<jbyte *>(value.data()));
  return value;
}

jbyteArray toBytes(JNIEnv *env, const std::string &value) {
  const auto length = static_cast<jsize>(value.size());
  jbyteArray bytes = env->NewByteArray(length);
  if (bytes) {
    env->SetByteArrayRegion(bytes, 0, length, reinterpret_cast<const jbyte *>(value.data()));
  }
  return bytes;
}

} // namespace

extern "C" JNIEXPORT jbyteArray JNICALL Java_expo_modules_jssandbox_JsSandboxNative_run(
    JNIEnv *env,
    jclass,
    jbyteArray runId,
    jbyteArray code,
    jint timeoutMs,
    jint memoryBytes,
    jint maxResultBytes,
    jint maxLogBytes) {
  const cherry::jssandbox::Limits limits{
      static_cast<uint32_t>(timeoutMs),
      static_cast<size_t>(memoryBytes),
      static_cast<size_t>(maxResultBytes),
      static_cast<size_t>(maxLogBytes),
  };
  return toBytes(
      env,
      cherry::jssandbox::run(
          fromBytes(env, runId), fromBytes(env, code), limits));
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_jssandbox_JsSandboxNative_cancel(JNIEnv *env, jclass, jbyteArray runId) {
  cherry::jssandbox::cancel(fromBytes(env, runId));
}

extern "C" JNIEXPORT jbyteArray JNICALL Java_expo_modules_jssandbox_JsSandboxNative_runBridge(
    JNIEnv *env, jclass, jbyteArray runId, jbyteArray setup, jbyteArray data,
    jdouble startedAt, jint seed, jint timeoutMs, jint memoryBytes, jobject sink) {
  jclass sinkClass = env->GetObjectClass(sink);
  jmethodID post = env->GetMethodID(sinkClass, "post", "([B)V");
  env->DeleteLocalRef(sinkClass);
  if (!post) return nullptr;
  const cherry::jssandbox::Limits limits{
      static_cast<uint32_t>(timeoutMs), static_cast<size_t>(memoryBytes), 0, 0};
  const auto result = cherry::jssandbox::runBridge(
      fromBytes(env, runId), fromBytes(env, setup), fromBytes(env, data),
      startedAt, static_cast<uint32_t>(seed), limits,
      [env, sink, post](const std::string &message) {
        jbyteArray bytes = toBytes(env, message);
        if (bytes) {
          env->CallVoidMethod(sink, post, bytes);
          env->DeleteLocalRef(bytes);
        }
        if (env->ExceptionCheck()) {
          env->ExceptionClear();
          throw std::runtime_error("Native sandbox message delivery failed.");
        }
      });
  return toBytes(env, result);
}

extern "C" JNIEXPORT void JNICALL Java_expo_modules_jssandbox_JsSandboxNative_deliver(
    JNIEnv *env, jclass, jbyteArray runId, jbyteArray message) {
  cherry::jssandbox::deliver(fromBytes(env, runId), fromBytes(env, message));
}
