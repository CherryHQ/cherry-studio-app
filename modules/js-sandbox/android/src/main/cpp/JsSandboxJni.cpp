#include <jni.h>

#include <string>

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
    jbyteArray storeJson,
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
          fromBytes(env, runId), fromBytes(env, code), fromBytes(env, storeJson), limits));
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_jssandbox_JsSandboxNative_cancel(JNIEnv *env, jclass, jbyteArray runId) {
  cherry::jssandbox::cancel(fromBytes(env, runId));
}
