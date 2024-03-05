import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-c, --count <count>', 'Number of LEDs [1-512]');

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			let count = program.getOptionValue('count');
			count = parseInt(count);

			await device.led.setCount({ count })
				.then(() => log(`✅ [${device.name}] LED Count → ${count}`))
				.catch(err => error(`❌ [${device.name}] LED Count → ${count}: ${err.message}`))
		}));
	})
	.catch(error);