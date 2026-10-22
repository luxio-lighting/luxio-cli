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

Script listings follow all pages on build 10 and newer, over HTTP and UART. Compression is handled by the device; CLI commands still use ordinary Lua source.

Build 11 uses separate power and brightness. `on`/`off` preserve brightness and mode; `brightness` accepts 1–256 and leaves power unchanged. Setting a color or running an animation/gradient turns the light on.
