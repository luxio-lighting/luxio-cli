#!/usr/bin/env NODE_OPTIONS=--no-warnings node

import { program } from 'commander';
import Package from '../package.json' assert { type: 'json' };

program
	.version(Package.version)

	// List devices
	.command('discover', 'Discover Luxio devices on your Wi-Fi')
	.command('monitor', 'Show a live view of all broadcasted events')

	// Full state
	.command('get-state', 'Get the device\'s state')

	// LED State
	.command('toggle-on', 'Toggle on/off')
	.command('set-on', 'Turn on')
	.command('set-off', 'Turn off')
	.command('set-brightness', 'Set the brightness')
	.command('set-color', 'Set a color')
	.command('set-gradient', 'Set a gradient')
	.command('set-animation', 'Set an animation')

	// LED Config
	.command('set-led-count', 'Set the number of LEDs')
	.command('set-led-type', 'Set the type of the LED strip')
	.command('set-led-pin', 'Set the pin of the LED strip')

	// Wi-Fi
	.command('get-wifi', 'Get a list of Wi-Fi networks')
	.command('set-wifi', 'Set the Wi-Fi network')

	// System
	.command('ping', 'Send a ping')
	.command('set-name', 'Set the name')
	.command('restart', 'Restart a Luxio device')
	.command('factory-reset', 'Factory reset a Luxio device')

	.parse();