// Compiles the vendored QuickJS-NG amalgamation (vendor/quickjs-ng) as one
// translation unit, with assertions off as in upstream release builds. Its
// warnings belong upstream.
#ifndef NDEBUG
#define NDEBUG
#endif
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

// The deterministic bridge runs on a dedicated thread. Interpose only this
// engine translation unit's clock/timezone reads; app clocks and ordinary
// run_js executions retain their platform behavior. Keep the vendor unchanged.
#include <stdint.h>
#include <sys/time.h>
#include <time.h>

static _Thread_local int cherry_clock_enabled;
static _Thread_local int64_t cherry_realtime_us;
static _Thread_local int64_t cherry_monotonic_us;

void cherry_js_clock(int enabled, int64_t realtime_us, int64_t monotonic_us) {
  cherry_clock_enabled = enabled;
  cherry_realtime_us = realtime_us;
  cherry_monotonic_us = monotonic_us;
}

static int cherry_gettimeofday(struct timeval *value, void *zone) {
  if (!cherry_clock_enabled) return gettimeofday(value, zone);
  value->tv_sec = cherry_realtime_us / 1000000;
  value->tv_usec = cherry_realtime_us % 1000000;
  return 0;
}

static int cherry_clock_gettime(clockid_t id, struct timespec *value) {
  if (!cherry_clock_enabled) return clock_gettime(id, value);
  const int64_t us = id == CLOCK_REALTIME ? cherry_realtime_us : cherry_monotonic_us;
  value->tv_sec = us / 1000000;
  value->tv_nsec = (us % 1000000) * 1000;
  return 0;
}

static struct tm *cherry_localtime_r(const time_t *value, struct tm *result) {
  return cherry_clock_enabled ? gmtime_r(value, result) : localtime_r(value, result);
}

#define gettimeofday cherry_gettimeofday
#define clock_gettime cherry_clock_gettime
#define localtime_r cherry_localtime_r
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Weverything"
#include "quickjs-amalgam.c"
#pragma clang diagnostic pop
#undef gettimeofday
#undef clock_gettime
#undef localtime_r
