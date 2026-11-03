# Native SSH

An Expo local module exposing bounded SSH command and SFTP operations. iOS and Android
share `cpp/Ssh.cpp` and the same pinned libssh2 source. Existing development clients need a new
native build for the command-input, authentication-event and file-operation interfaces; a JavaScript
update alone cannot add them. The JavaScript adapter treats an older native interface as unavailable.

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
Cancellation is safe before worker startup and never affects another run. A pool holds at most four
authenticated connections, keyed by profile ID and revision and checked against the endpoint,
username and trusted fingerprint. An exclusive lease is the only owner allowed to touch a
connection's libssh2 handles. Commands and files use fresh channels; a failed or cancelled operation
evicts its connection. There is no automatic reconnect or replay loop.

`maintain()` takes the same exclusive leases for idle connections, sends keepalives and retires
connections idle for five minutes. The backend schedules it every 15 seconds while connections
remain; keepalives do not extend idle lifetime. Checkout also checks idle age, including after app
suspension. `closePool(key)` retires a configuration revision and `closeAll()` drains idle resources
at shutdown. An active lease keeps its handles alive until its operation releases them.

The core resolves at most 16 addresses, limits concurrent DNS workers to four, and checks operation
cancellation/deadlines while awaiting DNS. POSIX DNS resolution itself is not cancellable: abandoned
resolver workers retain only host/port and finish independently. TCP attempts give alternate
addresses a chance after three seconds. Connect/handshake/authentication have a shared 20-second
budget; commands default to 60 seconds and accept a per-call 1–600 second budget. Uploads and
downloads have a separate five-minute budget (native hard cap: 600 seconds). Human authentication waiting extends these deadlines by at most 120 seconds total.
Poll waits are at most 100 ms.

A probe performs a handshake without authenticating. Execution compares the peer's SHA-256 host
fingerprint with the approved fingerprint **before sending credentials**. Password and in-memory
private-key authentication are supported, with an optional private-key passphrase. A reused
connection retains the same verified peer and cannot cross profile revisions. Keyboard-interactive
authentication is a fallback when offered by the server, including additional authentication after
a key. It emits bounded server questions through `onEvent`; `respond(id, challenge, answers)` accepts
answers only for that active challenge. At most four rounds and eight prompts per round are
allowed. Answers are cleared after use and never included in results. Server prompts are shown to
the user rather than automatically filled with a stored password. SSH agents, PTYs and forwarding
are not exposed.

`exec` opens a fresh shell channel. `directory` supplies its default working directory; `cwd` can
override it with an absolute path or a path relative to that directory. Paths are shell-quoted;
the command is a separate subshell after a successful directory change. UTF-8 `stdin` is bounded
to 256 KiB and interleaved with output reads before EOF, avoiding a full-duplex pipe deadlock.
This is finite input supplied with the request, not an interactive terminal. Connection reuse does
not preserve shell state or the working directory between calls. Each output stream retains at most
128 KiB split between its head and tail; excess output is drained and marked truncated. Initial
output events are bounded separately; the final result contains the retained tail. Output events
are batched and base64 encoded to preserve UTF-8 boundaries and arbitrary bytes across both bridges.
The backend decodes command output with replacement for invalid UTF-8. `onEvent` also carries
authentication challenges and transfer progress; routing always includes the native run ID.

SFTP supports `list`, `read`, `write`, `download` and `upload`. Paths are relative to the configured
remote directory; canonical paths must remain inside its resolved root. This bounds the file
interface, not the account's command permissions, and is not a filesystem sandbox against concurrent
remote changes. Directory results stop at 500 entries or the result byte budget. Directory symlinks are navigable;
each navigation resolves the destination and checks the configured root again. Text reads/writes
are limited to 256 KiB; transfers to 20 MiB. Non-UTF-8 or NUL-containing files are rejected as text
by the backend and remain downloadable. Transfer events are throttled to 100 ms plus completion.

Writes stage a uniquely named sibling file with exclusive creation, close it, then rename it.
Default creation refuses existing destinations. Explicit replacement requires the server's
`posix-rename@openssh.com` extension; unsupported servers fail without deleting the destination.
Basic permission bits are preserved on replacement, but ownership, ACLs and extended attributes are
not copied. Failures attempt to remove only a temporary file whose creation was confirmed; a lost
connection may leave it behind. The native `localPath` is a backend-owned staging path, never model
input. It is not exposed in tool results.

`not-started` means exec was not sent or was explicitly rejected. Once exec may have been sent,
interruption returns `unknown`. `exited` requires an actual exit-status packet; absent status is
never assumed to mean zero. Closing the local socket cannot guarantee termination of the remote
process. File operations report `completed` only after their operation is confirmed; writes become
`unknown` before sending the first mutating request. Confirmed outcomes survive later cleanup errors.
Diagnostics contain only a fixed phase, numeric error/host-key codes, negotiated algorithms,
advertised authentication methods and connection-reuse status. Raw library error strings and
credentials are excluded. No operation is replayed automatically. Background execution is bounded by the existing
platform lease; this is not a durable remote job runner.

Native build and device acceptance remain necessary before distribution. Follow
[Local EAS Builds](../../docs/guides/local-builds.md) and obtain the active task's build/device
authorization first. Exercise both platforms against password and encrypted-key servers, host-key
changes, slow DNS, cancellation, missing exit status and large/interleaved input/output. Also cover
multi-round authentication and late answers, SFTP permission/size errors, binary downloads,
no-overwrite races, atomic replacement support, interruption during transfer/rename, retained file
permissions, expired pool entries, foreground resumption and profile edits during active operations.
