cmake_minimum_required(VERSION 3.16)
project(jssandbox)

set(CMAKE_CXX_STANDARD 20)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(hermes-engine REQUIRED CONFIG)

add_library(jssandbox SHARED
  src/main/cpp/JsSandboxJni.cpp
  ../cpp/JsSandbox.cpp
)

target_include_directories(jssandbox PRIVATE ../cpp)
target_compile_options(jssandbox PRIVATE -fexceptions -frtti -O2 -Wall)
target_link_libraries(jssandbox ReactAndroid::jsi hermes-engine::hermesvm)
