import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-t, --type <type>', 'LED Type [WS2812, SK6812]');

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			const type = program.getOptionValue('type');

			await device.led.setType({ type })
				.then(() => log(`✅ [${device.name}] LED Type → ${type}`))
				.catch(err => error(`❌ [${device.name}] LED Type → ${type}: ${err.message}`))
		}));
	})
	.catch(error);