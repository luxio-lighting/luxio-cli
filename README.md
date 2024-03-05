# Luxio CLI

An open source command line interface to control & configure [Luxio LED Strips](https://luxio.lighting).

[![npm](https://img.shields.io/npm/v/@luxio-lighting/cli.svg)](https://www.npmjs.com/package/@luxio-lighting/cli)

## Installation

Ensure you have Node.js installed first. Then:

```bash
$ npm install -g @luxio-lighting/cli
```

## Usage
```
$ luxio --help

Commands:
  discover        Discover Luxio devices on your Wi-Fi

  monitor         Show a live view of all broadcasted events

  get-state       Get the device's state

  toggle-on       Toggle on/off
  set-on          Turn on
  set-off         Turn off
  set-brightness  Set the brightness
  set-color       Set a color
  set-gradient    Set a gradient
  set-animation   Set an animation
  set-led-count   Set the number of LEDs
  set-led-type    Set the type of the LED strip
  set-led-pin     Set the pin of the LED strip

  get-wifi        Get a list of Wi-Fi networks
  set-wifi        Set the Wi-Fi network

  set-name        Set the name

  ping            Send a ping
  restart         Restart a Luxio device
  factory-reset   Factory reset a Luxio device

  help [command]  display help for command
```

## Examples

```bash
$ luxio discover
$ luxio set-on
$ luxio set-brightness --brightness "10%" --device "Bedroom"
$ luxio set-gradient --colors "#FF0000,#0000FF" --device "Living Room"
```

> Prefix `LUXIO_DEBUG=1` to see all debug output.