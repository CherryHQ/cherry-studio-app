cmake_minimum_required(VERSION 3.16)
project(cherryssh C CXX)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
if(DEFINED ENV{NODE_BINARY} AND NOT "$ENV{NODE_BINARY}" STREQUAL "")
  set(SSH_NODE "$ENV{NODE_BINARY}")
else()
  find_program(SSH_NODE node)
endif()
if(NOT SSH_NODE)
  message(FATAL_ERROR "Node.js is required to prepare libssh2")
endif()
get_filename_component(SSH_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
  "${SSH_ROOT}/upstream.json" "${SSH_ROOT}/prepareLibssh2.cjs")
execute_process(COMMAND "${SSH_NODE}" "${SSH_ROOT}/prepareLibssh2.cjs"
  RESULT_VARIABLE SSH2_PREPARE_RESULT OUTPUT_VARIABLE SSH2_SOURCE
  OUTPUT_STRIP_TRAILING_WHITESPACE TIMEOUT 250)
if(NOT SSH2_PREPARE_RESULT STREQUAL "0")
  message(FATAL_ERROR "Could not prepare the pinned libssh2 source")
endif()
set(SSH2_SOURCE "${SSH_ROOT}/${SSH2_SOURCE}")
file(GLOB SSH2_SOURCES "${SSH2_SOURCE}/src/*.c")
list(FILTER SSH2_SOURCES EXCLUDE REGEX "/blowfish.c$")
add_library(cherryssh SHARED src/main/cpp/SshJni.cpp ../cpp/Ssh.cpp ${SSH2_SOURCES})
target_include_directories(cherryssh PRIVATE ../cpp "${SSH2_SOURCE}/include" "${SSH2_SOURCE}/src")
target_compile_definitions(cherryssh PRIVATE HAVE_CONFIG_H LIBSSH2_OPENSSL LIBSSH2_NO_AES_CBC)
target_compile_options(cherryssh PRIVATE
  $<$<COMPILE_LANGUAGE:CXX>:-fexceptions>
  $<$<COMPILE_LANGUAGE:CXX>:-frtti>
)
find_package(opensslstatic REQUIRED CONFIG)
target_link_libraries(cherryssh opensslstatic::crypto)
target_link_options(cherryssh PRIVATE "-Wl,--exclude-libs,ALL")
