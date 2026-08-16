# AI Runtime Instructions

When changing mapped or ported source, or changing behavior synchronized from Desktop, read
[README.md](README.md), update the provenance evidence, and run `pnpm check` plus
`pnpm ai-runtime:check --desktop-root <path>` from this directory. A port is trusted only while both
gates pass. Other package changes use the relevant checks in
[Testing And CI](../../docs/guides/testing-and-ci.md). Keep platform behavior behind backend adapters
and expose package behavior only through the five declared subpaths.
