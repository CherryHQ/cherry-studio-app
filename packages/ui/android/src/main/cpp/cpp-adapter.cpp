#include <fbjni/fbjni.h>
#include "CherryStudioUIOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *)
{
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::cherrystudio::ui::registerAllNatives();
  });
}
