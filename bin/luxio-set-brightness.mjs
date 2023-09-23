import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-b, --brightness <percentage>', 'Brightness in % [0-100]');

getDevices()
	.then(async devices => {
		const brightness = program.getOptionValue('brightness');

		await Promise.all(devices.map(async device => {
			device.brightness = (parseFloat(brightness) / 100);
			device.on = true;
			await device.sync()
				.then(() => log(`✅ [${device.name}] Brightness → ${brightness}%`))
				.catch(err => error(`❌ [${device.name}] Brightness → ${brightness}%: ${err.message}`))
		}));
	})
	.catch(error);