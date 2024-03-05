# Luxio CLI (Command Line Interface)

[![Node version](https://img.shields.io/npm/v/@luxio-lighting/cli.svg)](https://www.npmjs.com/package/@luxio-lighting/cli)

## Installation

```bash
$ npm install -g @luxio-lighting/cli
```

## Usage
```
$ luxio --help
Usage: luxio [options] [command]

Options:
  -V, --version    output the version number
  -h, --help       display help for command

Commands:
  devices          List Luxio devices on your Wi-Fi
  get-state        Get the state
  set-on           Turn on
  set-off          Turn off
  set-brightness   Set the brightness
  set-gradient     Set a gradient
  set-effect       Set an effect
  set-temperature  Set a color temperature
  set-name         Set the name
  set-pixels       Set the pixel count
  get-wifi         Get a list of Wi-Fi networks
  set-wifi         Set the Wi-Fi network
  restart          Restart a Luxio device
  help [command]   display help for command
```

## Examples

```bash
$ luxio devices
$ luxio set-on
$ luxio set-effect --id "rainbow"
$ luxio set-gradient --colors "#FF0000,#0000FF" --device "Living Room"
```