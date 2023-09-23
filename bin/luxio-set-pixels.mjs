import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-p, --pixels <count>', 'Number of pixels');

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			const pixels = program.getOptionValue('pixels');

			device.pixels = parseInt(pixels);
			device.sync()
				.then(() => log(`✅ [${device.name}] Pixels → ${pixels}`))
				.catch(err => error(`❌ [${device.name}] Pixels → ${pixels}: ${err.message}`))
		}));
	})
	.catch(error);