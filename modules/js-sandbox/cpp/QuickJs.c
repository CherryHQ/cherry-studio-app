// Compiles the vendored QuickJS-NG amalgamation (vendor/quickjs-ng) as one
// translation unit, with assertions off as in upstream release builds. Its
// warnings belong upstream.
#ifndef NDEBUG
#define NDEBUG
#endif
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Weverything"
#include "quickjs-amalgam.c"
#pragma clang diagnostic pop
