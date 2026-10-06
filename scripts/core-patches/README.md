# Flycast WebAssembly patches

The WebAssembly SH-4 recompiler (`rec-wasm/`) and the single-threaded/debug shims
(`snippets/`) come from [romdev](https://github.com/monteslu/romdev)
(`packages/romdevtools/scripts/patches/`, revision in `ROMDEV_REVISION`),
MIT-licensed, copyright Luis Montes (see `LICENSE-romdev`). They are compiled into
Flycast, which is GPL-2.0-or-later.

`scripts/build-core.sh` applies them to Flycast and builds the core. It follows
romdev's `build-flycast.sh`, with two changes for speed and the browser:

- **Native WebAssembly exceptions** (`-fwasm-exceptions`) instead of Emscripten's
  JavaScript-emulated exceptions (`-fexceptions -s DISABLE_EXCEPTION_CATCHING=0`).
  The emulated mode routes calls inside `try` regions and destructor cleanups through
  JavaScript `invoke_*` trampolines, which cost a large share of each frame.
- **Browser target with the in-memory file system** instead of `NODERAWFS`, so no
  post-build patching of the loader is needed.
