# AI Runtime Instructions

When changing this package or syncing desktop AI behavior, read [README.md](README.md), update the
provenance evidence, and run `pnpm check` plus `pnpm ai-runtime:check --desktop-root <path>` from this
directory. A port is trusted only while both gates pass. Keep platform behavior behind backend
adapters and expose package behavior only through the five declared subpaths.
