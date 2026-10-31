# Native SSH

An Expo local module exposing bounded, non-interactive SSH command operations. iOS and Android
share `cpp/Ssh.cpp` and the same pinned libssh2 source. Existing development clients need a new
native build to include this module; a JavaScript update alone cannot add it.

The native SSH runtime is bundled with the app. The source download described below happens only
on the build host; users do not download or install SSH components separately.

## Source and crypto ownership

`upstream.json` pins libssh2 commit
`94629f16bb313e522276b53a50f8d89c6eee81b0` (upstream `1.11.2_DEV`), its archive URL and SHA-256.
`prepareLibssh2.cjs` downloads that archive during CocoaPods installation or Android CMake
configuration, checks its digest before extraction, and caches the complete source tree under
`.cache/libssh2-<archive-sha256>`. Both platforms use this one preparation script; no third-party
source is checked in. Node.js, curl and tar are required on the build host. A cold cache needs
network access; a complete cache is reused without a download. Failed downloads or hash mismatches
stop preparation, and incomplete temporary trees are never published to the shared cache.

The cache is excluded from Git, EAS source archives and Expo compatibility fingerprints. The
committed pin, preparation script and native wrappers remain fingerprint inputs. Delete the module's
`.cache` directory to fetch a clean copy. `licenses/libssh2.txt` retains the upstream copyright
notice and is included in both native packages. There are no local source patches.
This pin includes fixes after the 1.11.1 release and the exit-status-presence API. Do not replace it
with an unpatched 1.11.1 package. Track [upstream security advisories](https://libssh2.org/security.html)
when updating the pin, and review source/API changes before changing the commit and archive digest.

The build compiles the upstream C sources except `blowfish.c`, which `bcrypt_pbkdf.c` includes.
`cpp/libssh2_config.h` is the iOS/Android POSIX configuration. Compression is not compiled in;
legacy algorithms disabled by upstream stay disabled, and AES-CBC is explicitly disabled.

- iOS depends on QuickCrypto 1.1.8 and uses its OpenSSL 3.6.2 headers, static framework, and forced
  `rnqc_*` symbol prefix. Updating QuickCrypto's packaging requires reviewing this podspec too.
- Android consumes the same OpenSSL prefab version as QuickCrypto,
  `io.github.ronickg:openssl-static:3.6.2-3`. Each shared library localizes its static crypto symbols
  with `--exclude-libs,ALL`; no competing `libcrypto.so` is introduced. This shares the build input,
  not the linked machine code: both shared libraries contain their required crypto symbols.

## Native contract

Call `prepare(id)` synchronously before scheduling `run(id, options)`. At most four runs are admitted.
Cancellation is safe before worker startup and never affects another run. Each run owns its own
socket, session and channel; there is no connection pooling or background reconnect loop.

The core resolves at most 16 addresses, limits concurrent DNS workers to four, and checks operation
cancellation/deadlines while awaiting DNS. POSIX DNS resolution itself is not cancellable: abandoned
resolver workers retain only host/port and finish independently. TCP attempts give alternate
addresses a chance after three seconds. Connect/handshake/authentication have a shared 20-second
budget; command execution has a 60-second total budget selected by the backend (native hard cap:
120 seconds). Poll waits are at most 100 ms.

A probe performs a handshake without authenticating. Execution compares the peer's SHA-256 host
fingerprint with the approved fingerprint **before sending credentials**. Password and in-memory
private-key authentication are supported, with an optional private-key passphrase. Keyboard
interactive authentication, agents, PTYs, interactive stdin, SFTP and forwarding are not exposed.

`exec` opens a fresh shell channel and sends stdin EOF. Combined stdout/stderr retention is limited
to 256 KiB before crossing the bridge; excess output is drained and marked truncated. Output events
are batched and base64 encoded to preserve UTF-8 boundaries and arbitrary bytes across both bridges.
The backend decodes text with replacement for invalid UTF-8.

`not-started` means exec was not sent or was explicitly rejected. Once exec may have been sent,
interruption returns `unknown`. `exited` requires an actual exit-status packet; absent status is
never assumed to mean zero. Closing the local socket cannot guarantee termination of the remote
process. No operation is replayed automatically. Background execution is bounded by the existing
platform lease; this is not a durable remote job runner.

Native build and device acceptance remain necessary before distribution. Follow
[Local EAS Builds](../../docs/guides/local-builds.md) and obtain the active task's build/device
authorization first. Exercise both platforms against password and encrypted-key servers, host-key
changes, slow DNS, cancellation, missing exit status and large/interleaved output.
