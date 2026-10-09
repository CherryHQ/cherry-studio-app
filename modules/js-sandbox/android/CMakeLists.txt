cmake_minimum_required(VERSION 3.16)
project(jssandbox C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)

add_library(jssandbox SHARED
  src/main/cpp/JsSandboxJni.cpp
  ../cpp/JsSandbox.cpp
  ../cpp/QuickJs.c
)

target_include_directories(jssandbox PRIVATE ../cpp ../vendor/quickjs-ng)
# -O2 in debug builds too: at -O0 QuickJS runs about 9x slower and its larger
# frames cut the recursion depth that fits in the stack from ~7,000 to ~800.
target_compile_options(jssandbox PRIVATE -O2 -Wall)
target_compile_options(jssandbox PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-fexceptions -frtti>)
target_link_libraries(jssandbox m)
