import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-t, --pin <pin>', 'LED Pin [0, 1, 2, ...]');

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			const pin = program.getOptionValue('pin');

			await device.led.setPin({ pin })
				.then(() => log(`✅ [${device.name}] LED Pin → ${pin}`))
				.catch(err => error(`❌ [${device.name}] LED Pin → ${pin}: ${err.message}`))
		}));
	})
	.catch(error);