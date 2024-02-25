import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-c, --color <HEX>', 'RGBW Color [#FFFFFFFF]');

getDevices()
	.then(async devices => {
		const color = program.getOptionValue('color');
		if (!color.startsWith('#')) {
			error('Invalid color format. Use HEX format: #FFFFFFFF');
		}

		const r = parseInt(color.substr(1, 2), 16);
		const g = parseInt(color.substr(3, 2), 16);
		const b = parseInt(color.substr(5, 2), 16);
		let w = parseInt(color.substr(7, 2), 16);
		if (Number.isNaN(w)) w = 0;

		await Promise.all(devices.map(async device => {
			await device.led.setColor({ r, g, b, w })
				.then(() => log(`✅ [${device.name}] R,G,B,W → ${r}, ${g}, ${b}, ${w}`))
				.catch(err => error(`❌ [${device.name}] R,G,B,W → ${r}, ${g}, ${b}, ${w}: ${err.message}`))
		}));
	})
	.catch(error);