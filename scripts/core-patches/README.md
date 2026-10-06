# Flycast WebAssembly patches

The WebAssembly SH-4 recompiler (`rec-wasm/`) and the single-threaded/debug shims
(`snippets/`) come from [romdev](https://github.com/monteslu/romdev)
(`packages/romdevtools/scripts/patches/`, revision in `ROMDEV_REVISION`),
MIT-licensed, copyright Luis Montes (see `LICENSE-romdev`). They are compiled into
Flycast, which is GPL-2.0-or-later.

`scripts/build-core.sh` applies them to Flycast and builds the core. It follows
romdev's `build-flycast.sh`, with these changes:

- **Native WebAssembly exceptions** (`-fwasm-exceptions`) instead of Emscripten's
  JavaScript-emulated exceptions (`-fexceptions -s DISABLE_EXCEPTION_CATCHING=0`).
  The emulated mode routes calls inside `try` regions and destructor cleanups through
  JavaScript `invoke_*` trampolines, which cost a large share of each frame.
- **Browser target with the in-memory file system** instead of `NODERAWFS`, so no
  post-build patching of the loader is needed.
- **Flycast's SSA block optimizer is skipped** on Emscripten. romdev's published
  core doesn't run it, and with it the recompiler goes wrong during the real BIOS
  boot (a black screen before the logo).
- **Fixes for building with Emscripten 4.0.18** (romdev's version, which the script
  checks for): the recompiler code cache is a plain array (newer LLVM rejects data in
  a `.text` section), `cvt_f2i_t` gets a generic canonical version matching the
  recompiler, the libretro target is a static library, the link uses `em++` and the
  bundled zlib, and submodules are fetched shallowly.
