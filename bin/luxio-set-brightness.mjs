import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-b, --brightness <percentage>', 'Brightness [10-255] or [1%-100%]');

getDevices()
	.then(async devices => {
		let brightness = program.getOptionValue('brightness');
		if (brightness.endsWith('%')) {
			brightness = Math.round(parseFloat(brightness) * (255 / 100));
			if (brightness < 10) brightness = 10;
			if (brightness > 255) brightness = 255;
		} else {
			brightness = parseInt(brightness);
		}

		await Promise.all(devices.map(async device => {
			await device.led.setBrightness({ brightness })
				.then(() => log(`✅ [${device.name}] Brightness → ${brightness}`))
				.catch(err => error(`❌ [${device.name}] Brightness → ${brightness}: ${err.message}`))
		}));
	})
	.catch(error);