#!/usr/bin/env bash
# Builds the Flycast libretro core to WebAssembly for Dreamport.
#
#   source /path/to/emsdk/emsdk_env.sh
#   scripts/build-core.sh            # → vendor/flycast/flycast_libretro.{js,wasm}
#
# Env: FLYCAST_REV (Flycast commit, default below), CORE_BUILD_DIR (work dir, default
# .core-build), JOBS (parallel compile jobs, default nproc), KEEP_BUILD=1 (incremental).
# Adapted from romdev's build-flycast.sh (MIT); see scripts/core-patches/README.md.
set -euo pipefail
command -v emcc >/dev/null || { echo "emcc not found: source emsdk_env.sh first"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCHES="$ROOT/scripts/core-patches"
FLYCAST_REV="${FLYCAST_REV:-1251a53}"
WORK="${CORE_BUILD_DIR:-$ROOT/.core-build}"
SRC="$WORK/flycast"
OUT="$ROOT/vendor/flycast"
JOBS="${JOBS:-$(nproc)}"
mkdir -p "$WORK" "$OUT"

if [ ! -d "$SRC/.git" ]; then
  git clone --filter=blob:none https://github.com/flyinghead/flycast.git "$SRC"
fi
cd "$SRC"
git checkout -q "$FLYCAST_REV"
# FreeType is only used by the standalone desktop UI (not the libretro build) and is
# hosted off GitHub, so skip it.
git -c submodule.core/deps/freetype.update=none submodule update --init --recursive --depth 1
# A partial or interrupted submodule checkout leaves an empty directory, which only
# surfaces later as a confusing CMake error. Fail early instead.
for d in core/deps/*/; do
  case "$d" in core/deps/freetype/) continue ;; esac
  if [ -z "$(ls -A "$d")" ]; then
    echo "build-core: submodule $d is empty; run: git -C $SRC submodule update --init --force $d" >&2
    exit 1
  fi
done
FULL_REV="$(git rev-parse HEAD)"

# ── Patches (idempotent; same as romdev's build-flycast.sh) ─────────────────
grep -q "romdev: emscripten" shell/cmake/DetectArchitecture.cmake || \
  perl -0pi -e 's/(if \(CMAKE_OSX_ARCHITECTURES\)\n    set\(ARCHITECTURE "\$\{CMAKE_OSX_ARCHITECTURES\}"\)\n    return\(\)\nendif\(\))/$1\n\n# romdev: emscripten\/WASM has no JIT.\nif (EMSCRIPTEN)\n    set(ARCHITECTURE "wasm")\n    return()\nendif()/' shell/cmake/DetectArchitecture.cmake

if ! grep -q "CPU_GENERIC" core/build.h; then
  sed -i 's/#define CPU_X64      0x20000004/#define CPU_X64      0x20000004\n#define CPU_GENERIC  0x20000005/' core/build.h
  perl -0pi -e 's/(#if defined\(__x86_64__\) \|\| defined\(_M_X64\))/#if defined(__EMSCRIPTEN__)\n\t#define HOST_CPU CPU_GENERIC\n\t#define FEAT_SHREC DYNAREC_JIT\n\t#define FEAT_AREC DYNAREC_NONE\n\t#define FEAT_DSPREC DYNAREC_NONE\n#elif defined(__x86_64__) || defined(_M_X64)/' core/build.h
fi
grep -q "FEAT_SHREC DYNAREC_JIT" core/build.h || { echo "FATAL: build.h patch failed"; exit 1; }

grep -q "HOST_CPU == CPU_GENERIC" core/hw/sh4/sh4_core_regs.cpp || \
  perl -0pi -e 's/(    #else\n\t#error "SetFloatStatusReg: Unsupported platform")/    #elif HOST_CPU == CPU_GENERIC\n\t(void)roundingMode; (void)denorm2zero;\n$1/' core/hw/sh4/sh4_core_regs.cpp
grep -q "HOST_CPU == CPU_GENERIC" core/linux/context.cpp || \
  perl -0pi -e 's/(#else\n\t#error Unsupported HOST_CPU)/#elif HOST_CPU == CPU_GENERIC\n\t(void)hostctx; (void)segfault_ctx;\n$1/' core/linux/context.cpp

grep -q "romdev: emscripten/WASM libretro build" CMakeLists.txt || \
  perl -0pi -e 's/(\ttarget_compile_definitions\(\$\{PROJECT_NAME\} PRIVATE LIBRETRO\)\n)/$1\tif(EMSCRIPTEN) # romdev: emscripten\/WASM libretro build\n\t\ttarget_compile_definitions(\${PROJECT_NAME} PRIVATE ASIO_STANDALONE ASIO_DISABLE_THREADS ASIO_DISABLE_LOCAL_SOCKETS ASIO_DISABLE_SERIAL_PORT ESHUTDOWN=110 SA_RESTART=0 SA_NOCLDWAIT=0 IMGUI_DISABLE_DEFAULT_SHELL_FUNCTIONS)\n\tendif()\n/' CMakeLists.txt
grep -q "core/rec-wasm/rec_wasm.cpp" CMakeLists.txt || \
  perl -0pi -e 's/(\t\t\tcore\/rec-x64\/x64_regalloc\.h\)\n\tendif\(\)\nendif\(\))/$1\n\nif(EMSCRIPTEN)\n\ttarget_sources(\${PROJECT_NAME} PRIVATE core\/rec-wasm\/rec_wasm.cpp)\nendif()/' CMakeLists.txt
grep -q "core/rec-wasm/rec_wasm.cpp" CMakeLists.txt || { echo "FATAL: CMakeLists rec-wasm patch failed"; exit 1; }

grep -q "__EMSCRIPTEN__" core/linux/posix_vmem.cpp || \
  perl -0pi -e "s/(bool init\(void \*\*vmem_base_addr, void \*\*sh4rcb_addr, size_t ramSize\)\n\{)/\$1\n#if defined(__EMSCRIPTEN__)\n\t(void)vmem_base_addr; (void)sh4rcb_addr; (void)ramSize; return false;\n#endif/" core/linux/posix_vmem.cpp

grep -q "romdev/WASM: no worker threads" core/stdclass.cpp || \
  perl -0pi -e 's/(void cThread::Start\(\)\n\{)/$1\n#if defined(__EMSCRIPTEN__)\n\treturn; \/* romdev\/WASM: no worker threads *\/\n#endif/' core/stdclass.cpp
grep -q "romdev/WASM: run inline" core/util/worker_thread.h || \
  perl -0pi -e "s/(\tvoid run\(Function&& task\) \{)/\$1\n#if defined(__EMSCRIPTEN__)\n\t\ttask(); return; \/* romdev\/WASM: run inline *\/\n#endif/" core/util/worker_thread.h
grep -q "romdev/WASM: no worker threads" core/util/periodic_thread.h || \
  perl -0pi -e 's/(\tvoid start\(\)\n\t\{)/$1\n#if defined(__EMSCRIPTEN__)\n\t\treturn; \/* romdev\/WASM: no worker threads *\/\n#endif/' core/util/periodic_thread.h
grep -q "romdev/WASM: single-threaded build" shell/libretro/option.cpp || \
  sed -i 's/Option<bool> ThreadedRendering(CORE_OPTION_NAME "_threaded_rendering", true);/#if defined(__EMSCRIPTEN__) \/* romdev\/WASM: single-threaded build *\/\nOption<bool> ThreadedRendering(CORE_OPTION_NAME "_threaded_rendering", false);\n#else\nOption<bool> ThreadedRendering(CORE_OPTION_NAME "_threaded_rendering", true);\n#endif/' shell/libretro/option.cpp
grep -q "romdev force single-thread" shell/libretro/libretro.cpp || \
  perl -0pi -e 's/(\tif \(first_startup\)\n\t\{\n\t\tif \(config::ThreadedRendering\))/#if defined(__EMSCRIPTEN__)\n\tconfig::ThreadedRendering.override(false); \/\/ romdev force single-thread (no workers in WASM)\n#endif\n$1/' shell/libretro/libretro.cpp

# Profiling exports used by Dreamport's performance overlay.
grep -q "romdev_aica_prof_ms" core/hw/aica/aica.cpp || \
  perl -0pi -e 's/(static int AicaUpdate\(int tag, int cycles, int jitter, void \*arg\)\n\{\n)(\targm::run\(1\);|\tarm::run\(1\);)/#include <emscripten.h>\ndouble g_aica_prof_ms = 0.0;\nextern "C" EMSCRIPTEN_KEEPALIVE double romdev_aica_prof_ms(int reset){ double v=g_aica_prof_ms; if(reset) g_aica_prof_ms=0.0; return v; }\n\n$1\tdouble _t0 = emscripten_get_now();\n$2\n\tg_aica_prof_ms += emscripten_get_now() - _t0;/' core/hw/aica/aica.cpp
grep -q "romdev_aica_prof_ms" core/hw/aica/aica.cpp || { echo "FATAL: aica prof patch failed"; exit 1; }
if ! grep -q "romdev_gpu_prof_ms" core/hw/pvr/Renderer_if.cpp; then
  perl -0pi -e 's/(#include <mutex>\n)/$1#include <emscripten.h>\ndouble g_gpu_prof_ms = 0.0;\nextern "C" EMSCRIPTEN_KEEPALIVE double romdev_gpu_prof_ms(int reset){ double v=g_gpu_prof_ms; if(reset) g_gpu_prof_ms=0.0; return v; }\nstruct RomdevGpuTimer { double t0; RomdevGpuTimer(){ t0 = emscripten_get_now(); } ~RomdevGpuTimer(){ g_gpu_prof_ms += emscripten_get_now() - t0; } };\n/' core/hw/pvr/Renderer_if.cpp
  perl -0pi -e 's/(\n\t\t\{\n\t\t\tFC_PROFILE_SCOPE_NAMED\("Renderer::Process"\);)/\n\t\tRomdevGpuTimer _rgt;$1/' core/hw/pvr/Renderer_if.cpp
fi
grep -q "RomdevGpuTimer _rgt" core/hw/pvr/Renderer_if.cpp || { echo "FATAL: gpu prof patch failed"; exit 1; }

# ── Patches for current Emscripten (not in romdev's script) ─────────────────
# Newer LLVM rejects data placed in a ".text" section ("data symbols must live in a
# data section"), which is what Flycast's generic-unix code cache declares. The WASM
# JIT never executes from that buffer, so a plain array (as on Android) is enough.
grep -q "romdev/dreamport: wasm code cache" core/oslib/virtmem.h || \
  perl -0pi -e 's/(#elif defined\(__ANDROID__\)\n)/#elif defined(__EMSCRIPTEN__) \/\/ romdev\/dreamport: wasm code cache\n#define DECLARE_CODE_CACHE(Name, Size) alignas(4096) static u8 Name[Size];\n$1/' core/oslib/virtmem.h
grep -q "romdev/dreamport: wasm code cache" core/oslib/virtmem.h || { echo "FATAL: virtmem patch failed"; exit 1; }
# cvt_f2i_t has canonical (interpreter/SSA) versions only for x86 and ARM hosts. Add a
# generic one matching the WASM JIT: saturate, and NaN gives 0x80000000 like the SH-4.
grep -q "dreamport: generic cvt_f2i_t" core/hw/sh4/dyna/shil_canonical.h || \
  perl -0pi -e 's/(\t\tif \(std::isnan\(f1\)\)\n\t\t\tres = 0x80000000;\n\t\}\n\treturn res;\n\)\n)(#endif)/$1#else \/\/ dreamport: generic cvt_f2i_t\nshil_canonical\n(\nu32,f1,(f32 f1),\n\ts32 res;\n\tif (std::isnan(f1))\n\t\tres = (s32)0x80000000;\n\telse if (f1 >= 2147483648.0f)\n\t\tres = 0x7fffffff;\n\telse if (f1 <= -2147483648.0f)\n\t\tres = (s32)0x80000000;\n\telse\n\t\tres = (s32)f1;\n\treturn res;\n)\n$2/' core/hw/sh4/dyna/shil_canonical.h
grep -q "dreamport: generic cvt_f2i_t" core/hw/sh4/dyna/shil_canonical.h || { echo "FATAL: cvt_f2i_t patch failed"; exit 1; }

# Flycast's libretro target is a SHARED library, which Emscripten's linker refuses
# (--no-undefined). We link the archive ourselves below, so build it STATIC.
grep -q "dreamport: static on emscripten" CMakeLists.txt || \
  perl -0pi -e 's/(elseif\(LIBRETRO\)\n)\tadd_library\(\$\{PROJECT_NAME\} SHARED core\/emulator\.cpp\)\n/$1\tif(EMSCRIPTEN) # dreamport: static on emscripten\n\t\tadd_library(\${PROJECT_NAME} STATIC core\/emulator.cpp)\n\telse()\n\t\tadd_library(\${PROJECT_NAME} SHARED core\/emulator.cpp)\n\tendif()\n/' CMakeLists.txt
grep -q "dreamport: static on emscripten" CMakeLists.txt || { echo "FATAL: static library patch failed"; exit 1; }

mkdir -p core/rec-wasm
cp "$PATCHES"/rec-wasm/* core/rec-wasm/

# ── Compile ─────────────────────────────────────────────────────────────────
# -fwasm-exceptions: native WebAssembly exception handling (the recompiler's
# block-exit/MMU-fault path throws C++ exceptions).
CXXFLAGS_EXTRA="-DJIT_PROD_BUILD -fwasm-exceptions"
CFLAGS_EXTRA="-DJIT_PROD_BUILD -fwasm-exceptions"
# KEEP_BUILD=1 reuses the previous build directory (incremental rebuild).
[ "${KEEP_BUILD:-0}" = "1" ] || rm -rf build-em
mkdir -p build-em && cd build-em
# ZLIB_LIBRARY: Flycast only tells libzip where the bundled zlib headers are; newer
# CMake also wants the library, so name the bundled zlib target.
emcmake cmake .. -DLIBRETRO=ON -DUSE_VULKAN=OFF -DUSE_GLES=ON -DUSE_GLES2=OFF -DCMAKE_BUILD_TYPE=Release \
  -DZLIB_LIBRARY=zlibstatic \
  -DCMAKE_CXX_FLAGS="$CXXFLAGS_EXTRA" -DCMAKE_C_FLAGS="$CFLAGS_EXTRA"
emmake make flycast_libretro -j"$JOBS"

emcc -O2 -fwasm-exceptions -c "$PATCHES/snippets/flycast-pthread-noop.c" -o pthread-noop.o
em++ -O2 -fwasm-exceptions -c "$PATCHES/snippets/flycast-debug.c" -o flycast-debug.o \
  -I"$SRC/core" -I"$SRC/core/deps" -I"$SRC/core/deps/nowide/include" -I"$SRC/core/deps/glm" \
  -I"$SRC/core/deps/stb" -I"$SRC/core/deps/xxHash" -std=c++17 -DTARGET_NO_OPENMP -DLIBRETRO -DTARGET_NO_THREADS

# ── Link ────────────────────────────────────────────────────────────────────
LIBS="libflycast_libretro.a libflycast-resources.a core/deps/libelf/libelf.a core/deps/nowide/libnowide.a core/deps/miniupnpc/libminiupnpc.a core/deps/libchdr/libchdr-static.a core/deps/tinygettext/libtinygettext.a core/deps/libzip/lib/libzip.a core/deps/xxHash/cmake_unofficial/libxxhash.a core/deps/libchdr/deps/zlib-*/libz.a core/deps/libchdr/deps/lzma-*/liblzma.a core/deps/libchdr/deps/zstd-*/build/cmake/lib/libzstd.a"
EXPORTS='["_retro_api_version","_retro_init","_retro_deinit","_retro_set_environment","_retro_set_video_refresh","_retro_set_audio_sample","_retro_set_audio_sample_batch","_retro_set_input_poll","_retro_set_input_state","_retro_get_system_info","_retro_get_system_av_info","_retro_load_game","_retro_unload_game","_retro_run","_retro_reset","_retro_serialize_size","_retro_serialize","_retro_unserialize","_retro_cheat_reset","_retro_cheat_set","_retro_get_memory_data","_retro_get_memory_size","_retro_get_region","_retro_set_controller_port_device","_romdev_sh4_regs_get","_romdev_aica_get","_romdev_dc_kcode_get","_romdev_aica_prof_ms","_romdev_jit_stats","_romdev_gpu_prof_ms","_malloc","_free","_emscripten_GetProcAddress","_wasm_mem_read8","_wasm_mem_read16","_wasm_mem_read32","_wasm_mem_write8","_wasm_mem_write16","_wasm_mem_write32","_wasm_exec_ifb","_wasm_exec_shil_fb"]'
RUNTIME='["ccall","cwrap","addFunction","removeFunction","HEAPU8","HEAPU16","HEAPU32","HEAP16","HEAP32","HEAPF32","UTF8ToString","stringToUTF8","lengthBytesUTF8","getValue","setValue","FS","dynCall","GL","wasmExports","wasmTable","wasmMemory"]'
emcc pthread-noop.o flycast-debug.o $LIBS -O3 -fwasm-exceptions \
  -Wl,--wrap=pthread_create -Wl,--wrap=pthread_join -Wl,--wrap=pthread_detach \
  -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=create_flycast -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=536870912 -s MAXIMUM_MEMORY=1073741824 \
  -s STACK_SIZE=4194304 -s ALLOW_TABLE_GROWTH=1 \
  -s EXPORTED_FUNCTIONS="$EXPORTS" -s EXPORTED_RUNTIME_METHODS="$RUNTIME" \
  -s FILESYSTEM=1 -s INVOKE_RUN=0 -s USE_ZLIB=1 -s MIN_WEBGL_VERSION=2 -s MAX_WEBGL_VERSION=2 \
  -s FULL_ES3=1 -s GL_ENABLE_GET_PROC_ADDRESS=1 -lGL -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
  -o "$OUT/flycast_libretro.js"
# Expose Emscripten's GL object on the module (Dreamport creates the WebGL context).
sed -i 's/var GL={/var GL=Module.GL={/' "$OUT/flycast_libretro.js"
cat > "$OUT/BUILD_INFO.json" <<JSON
{ "flycast": "$FULL_REV", "emscripten": "$(emcc --version | head -1 | sed 's/"/\\"/g')", "exceptions": "wasm", "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
JSON
echo "Built $OUT/flycast_libretro.{js,wasm} from Flycast $FULL_REV"
