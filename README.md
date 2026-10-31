<div align="center">
  <img src="docs/images/luxio-logo.png" alt="Luxio logo" width="80" />
  <h1>Luxio CLI</h1>
</div>

[![npm version](https://img.shields.io/npm/v/@luxio-lighting/cli)](https://www.npmjs.com/package/@luxio-lighting/cli)
[![Publish CLI](https://github.com/luxio-lighting/luxio-cli/actions/workflows/publish-cli.yml/badge.svg)](https://github.com/luxio-lighting/luxio-cli/actions/workflows/publish-cli.yml)

Control your Luxio lights from the terminal. Pick a color, dim the room, play an animation, or change every light with one command.

This manual covers **v3.0.0**. You can connect over your local network or a USB serial connection.

## Get started

Install with **Node.js 22 or newer**:

```sh
npm install --global @luxio-lighting/cli
luxio --version
```

Connect your computer to the same network as your lights, then find them:

```sh
luxio discover
```

If exactly one light is found, you can start controlling it immediately:

```sh
luxio set-color "#ff8000"
luxio brightness set 80%
luxio on set false
luxio on set true
```

Have more than one light? Add `--device` to choose one, or `--device '*'` to choose them all.

## Choose your lights

Use a device name, ID, or network address from `luxio discover`:

```sh
luxio --device "Kitchen light" brightness set 60%
luxio --device 192.168.1.231 state get
```

To keep using the same light in your terminal session, set a default:

```sh
export LUXIO_DEVICE="Kitchen light"
luxio brightness get
```

An explicit `--device` overrides `LUXIO_DEVICE`. If neither is set, Luxio selects a light automatically only when exactly one is discovered.

### All lights

Quote the asterisk so your shell passes it to Luxio:

```sh
luxio --device '*' on set true
luxio --device '*' brightness set 80%
luxio --device '*' set-color "#ff8000"
```

Luxio discovers your network lights once, then runs the command on each in turn. Each result has a heading with the light's name, ID, and address. If one light fails, the others are still attempted. The command exits with status `1` if any light fails or none are found.

You can also use `export LUXIO_DEVICE='*'` as your default. The asterisk selects discovered network lights; it does not select serial ports.

### USB serial

Pass the serial port as the device:

```sh
luxio --device /dev/ttyACM0 state get
luxio --device COM3 state get
```

Replace the example with your device's port. Serial access is also useful for checking a light whose Wi-Fi connection is unavailable.

## Power and brightness

```sh
luxio on get
luxio on set yes
luxio on set no

luxio brightness get
luxio brightness set 80%
luxio brightness set 12.5%
```

For power, `true`, `1`, and `yes` mean on; `false`, `0`, and `no` mean off. `on get` prints `true` or `false`.

Brightness accepts **1%–100%**, including decimals. Include the `%` sign. The light uses the closest brightness level, and `brightness get` displays the nearest whole percentage, with a minimum of 1%.

Turning a light off preserves its brightness and mode. Changing brightness leaves power unchanged. Use `on set false` to turn a light off, rather than setting brightness to zero.

## Colors and gradients

Set a solid color with a six-digit RGB hex value:

```sh
luxio set-color "#ff0000"
luxio set-color 00ff00
```

Create a gradient with two to eight comma-separated colors:

```sh
luxio set-gradient "#ff0000,#ff8000,#0000ff"
```

The `#` prefix is optional. Quote values that start with `#` so your shell does not treat them as comments. Gradients require more than one configured LED/controller.

Both commands turn the light on and display the supplied colors without saving them to its library. To leave an animation or gradient, set a solid color.

### Individual color channels

For direct channel control, use values from 0 to 255:

```sh
luxio channels --red 255 --green 80 --blue 0
luxio channels --white 180
luxio channels --warm-white 200 --cool-white 40
```

Omitted channels are set to zero. `--white` requires an RGBW strip such as WS2814 or SK6812. `--warm-white` and `--cool-white` require WS2805. The CLI checks whether your strip supports the requested channels.

## Play an animation

Play a Lua animation file from your computer:

```sh
luxio set-animation rainbow.lua
```

This turns the light on and plays the animation without saving it to the light's library.

If your animation declares parameters, you can supply them when starting it or change them while it plays:

```sh
luxio set-animation glow.lua --parameters '{"Flicker":false,"Speed":75}'
luxio animation-set-parameters '{"Speed":25}'
```

The parameter names must match those declared by the animation. Changing parameters does not restart playback. To also keep the new values with an animation already saved on the light, add `--save`:

```sh
luxio animation-set-parameters '{"Speed":25}' --save
```

For an animation started with `set-animation`, save it to the library and start it with `run-animation <id>` before using `--save`.

### Writing animations with parameters

Declare parameters in comments at the start of your Lua file:

```lua
-- @parameter Flicker,Checkbox,true
-- @parameter Speed,Slider,50,0,100
-- @parameter Spacing,Number,8,1,64
-- @preview ff460c,d21400,ffc823
```

Read a value in your animation with `luxio_get_parameter("Speed")`. `Slider` and `Number` take a default, minimum, and maximum; `Checkbox` takes a boolean default. Slider and Checkbox parameters require firmware build 21 or newer. `Boolean` is also accepted as a legacy name for Checkbox.

The optional `@preview` comment supplies two to eight RGB colors for the animation's library preview. It does not change the animation's output and requires firmware build 19 or newer to appear in listings.

## Save your favorites

Colors, gradients, and animations each have their own library on the light. Save something you want to use again:

```sh
luxio save-color Red "#ff0000"
luxio save-gradient Sunset "#ff0000,#ff8000,#800080"
luxio save-animation rainbow.lua --name Rainbow
```

List the saved items to find their IDs:

```sh
luxio colors
luxio gradients
luxio animations
```

Use an item's ID to play, inspect, or delete it. Replace `<id>` below with the ID from its listing:

| Action | Color | Gradient | Animation |
| --- | --- | --- | --- |
| Play | `luxio run-color <id>` | `luxio run-gradient <id>` | `luxio run-animation <id>` |
| Inspect | `luxio get-color <id>` | `luxio get-gradient <id>` | `luxio get-animation <id>` |
| Delete | `luxio delete-color <id>` | `luxio delete-gradient <id>` | `luxio delete-animation <id>` |

`get-animation` prints the saved Lua source. Add `--id <id>` to any save command to update an existing item. Animation saves also accept `--parameters <json>` to store parameter values.

Saving is separate from playing: `set-*` displays supplied content, `save-*` stores it, and `run-*` plays a saved item. These separate libraries require firmware build 13 or newer.

## Configure a light

Read all settings, or get and set individual fields:

```sh
luxio config get
luxio config name get
luxio config name set "Kitchen light"
luxio config type set WS2805
luxio config led-count set 60
```

Every field below supports `get` and `set <value>`. Changing a field preserves the other settings.

| Field after `luxio config` | Value |
| --- | --- |
| `name` | Device name |
| `type` | Strip type, such as `WS2805` |
| `led-count` | 1–1024 |
| `gpio` | Output pin, 0–61; valid pins depend on your device |
| `channel` | 0–100 |
| `relay enabled` | `true`, `1`, `yes`, `false`, `0`, or `no` |
| `relay gpio` | Relay output pin, 0–61; valid pins depend on your device |
| `relay inverted` | `true`, `1`, `yes`, `false`, `0`, or `no` |
| `wifi enabled` | `true`, `1`, `yes`, `false`, `0`, or `no` |
| `matter enabled` | `true`, `1`, `yes`, `false`, `0`, or `no` |

For example, configure a relay's output pin before enabling it:

```sh
luxio config relay gpio set 12
luxio config relay enabled set yes
```

## Wi-Fi and Matter

Check the current Wi-Fi connection:

```sh
luxio wifi get
```

This shows the LAN address and available connection details, including the network name on supported firmware. It does not show the saved password.

To connect to a network, create a local file named `wifi.json`:

```json
{
  "ssid": "Your network name",
  "password": "Your network password"
}
```

Then send the file to your light. For initial setup over serial, for example:

```sh
luxio --device /dev/ttyACM0 wifi set wifi.json
```

To retrieve the Matter pairing code and QR payload for a compatible light:

```sh
luxio matter get-pair-code
```

## Update firmware

Check for an update, then install it:

```sh
luxio update get
luxio update install
```

Keep the light powered on during installation. It temporarily goes offline while the update is installed.

## Help and troubleshooting

Help is available at every level:

```sh
luxio --help
luxio brightness --help
luxio config relay --help
luxio save-animation --help
```

Use `luxio state get` for the full device state. On supported firmware, it includes network diagnostics and the last animation runtime error. `wifi get` provides a shorter view of the connection.

| What you see | What to try |
| --- | --- |
| No lights found | Check power and network access, or specify the light's IP address or serial port with `--device`. |
| Several lights found | Choose a name or address with `--device`, or use `--device '*'` for all discovered lights. |
| Cloud discovery unavailable | Local discovery can still work. You can also use a known IP address directly. |
| A channel or gradient is unsupported | Check `config type get` and `config led-count get` against your connected strip. |
| An animation fails | Read `state get` for `animationError`, then check the Lua source and declared parameters. |

Most commands print JSON. Brightness, power, and individual config getters print a single value; `get-animation` prints Lua. Wildcard commands add a device heading before each result. Errors go to standard error and return exit status `1`.

The aliases `set`, `upload`, and `run` are available for `set-color`, `save-animation`, and `run-animation`. If you're upgrading from an older CLI, use the commands in this manual: power and brightness now use `get`/`set`, parameter changes use `animation-set-parameters`, and `stop` has been removed.

## Working from source

To build and run this checkout:

```sh
npm ci
npm run build
node dist/index.js --help
```

Run `npm run check` and `npm test` to check changes. Hardware tests are opt-in using `DEVICE_ADDRESS` and optionally `DEVICE_SERIAL`; see [the device test script](tools/test-cli-device.ts).

For a custom discovery service, use `--api <url>` or set `LUXIO_API_URL`. The default is `https://api.luxio.lighting`.
