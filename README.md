# Dreamport

A Sega Dreamcast emulator that runs in the browser. You bring your own BIOS and games; nothing is bundled and nothing leaves your device.

Dreamport is a web frontend for **[Flycast](https://github.com/flyinghead/flycast)**, the leading open-source Dreamcast emulator, compiled to WebAssembly (the [`romdev-core-flycast`](https://www.npmjs.com/package/romdev-core-flycast) build of its libretro core). Flycast does the hard part: SH-4 CPU, PowerVR2 graphics through WebGL2, AICA sound and GD-ROM. Dreamport adds the browser frontend around it: display filters, input, saves, netplay, achievements and the interface.

## Running it

Requires Node 22+ and a browser with WebGL2 (current Chrome, Edge, Firefox or Safari).

```bash
npm install
npm run dev          # http://localhost:5173 (includes netplay rooms + achievements proxy)
```

Production:

```bash
npm run build        # type-check, copy + patch the core, bundle into dist/
npm start            # serves dist/ with netplay rooms and the achievements proxy (PORT=8080)
```

**Netlify:** `netlify.toml` builds the app and proxies `/ra/*` to RetroAchievements. Netlify can't host WebSockets, so on Netlify netplay uses copy-and-paste invite codes. Room codes work if you set a room server URL in Settings → Netplay, for example one running `npm start`.

Tests:

```bash
npm test             # unit tests (achievement conditions, disc reader/hash, netplay codec, input, …)
npm run test:e2e     # end-to-end in headless Chromium; needs `npx playwright install chromium`
```

## First run

1. **Add your BIOS.** Use `dc_boot.bin` (2 MB, required for commercial discs) and optionally `dc_flash.bin` (128 KB), dumped from your own console. Both are checked by size and against known-good checksums, then kept in IndexedDB.
2. **Open a game.** Choose files, choose a folder, or drag and drop. Supported formats:
   - **GDI** with its track files
   - **CHD** (recommended: one compact file)
   - **CDI**
   - **CUE/BIN**
   - **M3U** playlists for multi-disc games
   - homebrew **ELF**

   Games can be kept in a library stored in the browser's private file system (OPFS), so you only add them once.
3. With a BIOS added, **Start console without a disc** boots to the Dreamcast system menu (memory-card manager, clock, language, CD player).
4. Homebrew ELFs boot without a BIOS. For discs without a BIOS you can opt in to Flycast's HLE BIOS under Settings → Emulation, but compatibility is lower.

## Features

### Emulator settings
- All of Flycast's own options appear under Settings → Emulation, grouped and searchable. They include internal resolution up to 4K and beyond, widescreen hack, region, language, cable type, mipmapping, anisotropic filtering, frame skipping, CPU clock, VMU options and controller expansion slots.
- Options that only take effect after a restart are labelled.
- Save states: 9 slots plus an auto-save on exit, with thumbnails, stored compressed.
- VMU memory cards and system flash sync to IndexedDB automatically, and can be exported and imported.
- Fast forward (hold or toggle, 2–8×), pause, screenshots, fullscreen, disc swapping for multi-disc games, and pause when the tab is hidden.

### Filters and shaders
Each is a WebGL2 pass over the emulator output:
- Sharp pixels, bilinear, sharp bilinear, bicubic (Catmull-Rom)
- **CRT** (curvature, scanlines, shadow mask, glow)
- Scanlines, LCD grid
- FXAA anti-aliasing
- Composite video (colour bleed, noise)

Filters with adjustable settings have sliders. There are also brightness, contrast, saturation and gamma controls, aspect modes (auto, 4:3, 16:9, stretch) and integer scaling.

### Controllers, keyboard and mouse
- **4 player ports.** Each can be a Controller, Arcade Stick, Twin Stick, Keyboard, Mouse or Light Gun, fed by the keyboard, a gamepad (1–4) or a netplay guest.
- **Gamepads:** standard-layout gamepads (Xbox, PlayStation, Switch Pro, …). Analog sticks and analog triggers are passed through, with adjustable deadzone and **rumble** (Puru Puru pack).
- **Remapping:** every Dreamcast control can be rebound for keyboard and for gamepad. A live gamepad tester shows what the browser sees.
- **Dreamcast keyboard:** for games like *The Typing of the Dead*. Your keyboard types into the game.
- **Dreamcast mouse:** click the game to capture the pointer, Esc to release.
- **Light gun:** aim with the mouse. Left click fires, right click reloads (shoots off screen).
- **Hotkeys:** all rebindable. On a controller, Home/Guide (or Back + Start) opens the menu.

| Default | Keyboard |
| --- | --- |
| Analog stick | W A S D |
| D-pad | Arrow keys |
| A / B / X / Y | K / L / J / I |
| L / R triggers | Q / E |
| Start | Enter |
| Menu · fast forward · pause | Esc · Tab (hold) · P |
| Save / load state · slot −/+ | F2 / F4 · F6 / F7 |
| Screenshot · fullscreen | F9 · F10 |

### Online multiplayer
- **How it works:** the host streams the game (video and audio) to up to three friends over WebRTC. Friends send their controller or keyboard input back and become players 2–4.
- **Why streaming:** it works with every game and can never desync. Friends don't need the game or a BIOS.
- **Connecting:** use a 6-letter **room code** (or invite link) through the signaling server, or **invite codes** you copy and paste, which need no server at all.
- **Managing players:** the host can assign each guest to a port or let them spectate, and can remove players. There's ping display, text chat, and the host's pause shows for everyone.
- **Settings:** stream quality and STUN/TURN servers. Behind strict NATs, a TURN server may be needed.

### Achievements (RetroAchievements)
- **Sign-in:** sign in with your RetroAchievements account. Only the login token is stored.
- **Game identification:** GDI and CUE/BIN discs are identified with RetroAchievements' Dreamcast hash (MD5 of the IP.BIN header and the boot executable). For CHD/CDI, Dreamport reads the game title the BIOS loads into memory and matches it against RetroAchievements' Dreamcast list; this is labelled when used.
- **Evaluation:** achievement conditions are evaluated against the Dreamcast's RAM every frame by a TypeScript implementation of the rcheevos trigger logic. It covers memory sizes, delta/prior/BCD, hit counts, ResetIf/PauseIf, AddSource/AddHits, AndNext/OrNext, AddAddress pointers, Remember/Recall and Measured progress.
- **Local only:** unlocks pop up and are **tracked locally in your browser**. They are *not* posted to your RetroAchievements profile, because only emulators approved by RetroAchievements may submit unlocks.

## Legal

Dreamport contains no BIOS, no games and no copyrighted Sega code. Only use BIOS and game dumps from hardware and discs you own. BIOS files, games and saves are stored only in your browser and are never uploaded. Dreamcast is a trademark of SEGA; this project is not affiliated with or endorsed by SEGA.

## Limitations and honest notes

- **Performance depends on your machine.** The CPU runs through Flycast's WebAssembly recompiler on one thread. Light and mid-weight games should be playable on a recent desktop; demanding titles may run below full speed, especially at high internal resolutions. Phones and tablets will struggle, and there are no on-screen touch controls.
- **Tested with homebrew and a real BIOS, not yet with commercial discs.** Automated tests boot homebrew ELFs compiled for this project (in `tests/fixtures/`). A real BIOS was also checked by hand: it verifies, boots to the system menu, responds to the keyboard, plays menu sounds, saves and loads states, and its flash and VMU files persist. They cover rendering, input, save states, filters, settings, achievements (against a mocked RetroAchievements API) and two-browser netplay. Commercial discs could not be tested in the development environment.
- **Browser storage:** a 1 GB GDI is loaded fully into memory while playing (CHD is much smaller). Browsers may evict stored data under storage pressure; use Settings → Storage → "Protect my data" and export VMU saves as a backup.
- **Netplay** adds the stream's latency (typically a few frames on a good connection), and quality depends on the host's upload speed. Room codes need the bundled signaling server; invite codes work anywhere.
- **Achievements** are local only (see above). CHD/CDI identification by title can pick the wrong revision of a game.
- **Not included:** NAOMI/Atomiswave arcade games, rewind, the Dreamcast's original online services (broadband adapter), custom texture packs.
- **The core is built from Flycast plus romdev's WebAssembly recompiler.** `scripts/build-core.sh` builds it with native WebAssembly exceptions into `vendor/flycast/`, which is used when present. If `vendor/flycast/` is missing, `scripts/prepare-core.mjs` falls back to the `romdev-core-flycast` npm build and patches its Node-only loader for the browser (exact-match; the build fails if the core changes).

## How it's built

### Rebuilding the emulator core

`scripts/build-core.sh` builds the core from Flycast (pinned revision) plus the patches in `scripts/core-patches/` (romdev's WebAssembly SH-4 recompiler, MIT). It uses native WebAssembly exceptions rather than Emscripten's JavaScript-emulated ones, which removes a large per-frame overhead. To rebuild (Linux/macOS, needs git, CMake and the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) at version 4.0.18, which the script checks for):

```bash
emsdk install 4.0.18 && emsdk activate 4.0.18
source /path/to/emsdk/emsdk_env.sh
scripts/build-core.sh          # writes vendor/flycast/; takes 15–30 minutes
```


Vite + React + TypeScript, no UI libraries.

```
src/emu/        libretro frontend for the Flycast core, WebGL2 presenter + filters, AudioWorklet output, session (loop, saves, states)
src/input/      key and gamepad bindings, per-port input manager (pad, keyboard, mouse, light gun, remote players)
src/content/    game file grouping (GDI/CUE/M3U), GD-ROM sector reader, IP.BIN parser, RetroAchievements disc hash, MD5
src/storage/    IndexedDB, OPFS game library, BIOS store, VMU/flash sync, save states, settings
src/netplay/    WebRTC host/guest, input packet codec, invite codes, signaling client
src/achievements/  RetroAchievements API client, trigger parser/evaluator, runtime
src/pages/      Home, Player, Guest, Settings
server/         production server, netplay signaling (WebSocket), RetroAchievements proxy
scripts/        prepare-core.mjs (copies the core into public/core), build-core.sh + core-patches/ (rebuilds the core)
vendor/flycast/ the prebuilt core (flycast_libretro.js/.wasm + BUILD_INFO.json)
tests/          unit tests, end-to-end tests, homebrew test ELFs
```

`harness.html` is a developer page that boots an ELF straight into the core. It's only served in development.

## License

GPL-3.0-or-later (see `LICENSE`). The Flycast core is GPL-2.0-or-later. The test homebrew in `tests/fixtures/` was compiled with the romdevtools SH-4 toolchain and uses its MIT-licensed `dc.h` helper.
