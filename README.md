# Luxio CLI

Standalone TypeScript CLI with local protocol source and command tests. Node.js 22 or newer is required.

```sh
npm ci
npm run check
npm test
npm run build
node dist/index.js discover
node dist/index.js --device 192.168.1.231 set-color ff0000
node dist/index.js --device 192.168.1.231 set-gradient ff0000,00ff00,0000ff
node dist/index.js --device 192.168.1.231 off
node dist/index.js --device 192.168.1.231 brightness 128
node dist/index.js --device 192.168.1.231 on
node dist/index.js --device 192.168.1.231 check-update
node dist/index.js --device 192.168.1.231 update
npm pack --dry-run
```

Serial paths are also accepted by `--device`. Hardware tests are opt-in via `DEVICE_ADDRESS` and `DEVICE_SERIAL`; see `tools/test-cli-device.ts`. CI checks out only this repository. The published bundle includes the local protocol source; no sibling repository or unpublished shared package is needed.

Animation listings follow all pages on build 10 and newer, over HTTP and UART. Compression is handled by the device; CLI commands still use ordinary Lua source.

Build 11 uses separate power and brightness. `on`/`off` preserve brightness and mode; `brightness` accepts 1–256 and leaves power unchanged. Setting a color or running an animation/gradient turns the light on.

## Independent libraries (firmware build 13)

`set-color`, `set-gradient`, and `set-animation` play supplied content from RAM without writing library files. Saving is explicit:

```sh
luxio set-color ff0000
luxio set-gradient ff0000,00ff00,0000ff
luxio set-animation rainbow.lua
luxio save-color Red ff0000
luxio save-gradient Sea 0011ff,00ff80
luxio save-animation rainbow.lua --name Rainbow
luxio colors
luxio gradients
luxio animations
luxio run-color <uuid>
luxio run-gradient <uuid>
luxio run-animation <uuid>
```

`save-color`, `save-gradient`, and `save-animation` accept `--id <uuid>` to update an existing item. `get-color`, `get-gradient`, `get-animation`, and the matching `delete-*` commands address each library independently. `stop` stops the active gradient or animation; `off` changes power. Colors and gradients use native data, not generated Lua.

Gradient creation and playback require more than one LED/controller. The CLI checks device capabilities before changing output: `--white` requires WS2814 (RGBW), while `--warm-white` and `--cool-white` require WS2805 (RGBCCT). WS2812 supports RGB only.

Animation commands use `animation` terminology, including JSON fields such as `animations`, `animation`, and `activeAnimationId`. `upload` and `run` remain aliases for `save-animation` and `run-animation`. Lua files keep their `.lua` extension.

## Animation parameters (firmware build 21+)

```sh
luxio set-animation glow.lua --parameters '{"Flicker":false,"Speed":75}'
luxio save-animation glow.lua --name Glow --parameters '{"Speed":60}'
luxio set-parameters '{"Speed":25}'
luxio set-parameters '{"Speed":25}' --save
```

Declare parameters in leading Lua comments (`-- @parameter Flicker,Checkbox,true` and `-- @parameter Speed,Slider,50,0,100`), then read them with `luxio_get_parameter("Speed")`. Use `Number` instead of `Slider` for a numeric input. `Boolean` remains a legacy alias for `Checkbox`. Slider and Checkbox require firmware build 21+. Types and ranges are validated. `set-parameters` patches the active animation without restarting or writing flash; `--save` also stores the values with the active saved animation. RAM previews must be saved before using `--save`.

Firmware build 15+ includes `networkStatus` in `luxio state`: Wi-Fi signal,
access point/channel, power-save mode, uptime, free internal memory and
Wi-Fi disconnect counters. This is useful over UART when LAN access fails;
`connected` reports AP association, not proof that IP traffic is working.

Firmware build 17 also returns `animationError` from `state` after a Lua runtime failure. It is retained until another animation starts or the device restarts; it is separate from a failed CLI request.

Animations can declare a palette hint in their leading comments, for example
`-- @preview ff460c,d21400,ffc823` (two to eight RGB hex colors). `set-animation`
and animation saves preserve this comment; firmware build 19 derives the preview
for device state and library listings. The hint does not alter LED rendering.
