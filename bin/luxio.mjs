#!/usr/bin/env NODE_OPTIONS=--no-warnings node

import { program } from 'commander';
import Package from '../package.json' assert { type: 'json' };

program
	.version(Package.version)

	// List devices
	.command('devices', 'List Luxio devices on your Wi-Fi')

	// Device state
	.command('get-state', 'Get the state')
	.command('set-on', 'Turn on')
	.command('set-off', 'Turn off')
	.command('set-brightness', 'Set the brightness')
	.command('set-gradient', 'Set a gradient')
	.command('set-effect', 'Set an effect')
	.command('set-temperature', 'Set a color temperature')

	// Device settings
	.command('set-name', 'Set the name')
	.command('set-pixels', 'Set the pixel count')

	// Wi-Fi
	.command('get-wifi', 'Get a list of Wi-Fi networks')
	.command('set-wifi', 'Set the Wi-Fi network')

	// System
	.command('restart', 'Restart a Luxio device')

	.parse();