import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-c, --colors <colors>', 'Colors, seperated by a comma, e.g. FF0000,00FF00,0000FF');

getDevices()
	.then(async devices => {
		const colors = program.getOptionValue('colors');

		await Promise.all(devices.map(async device => {
			device.gradient = colors.split(',');
			device.on = true;
			await device.sync()
				.then(() => log(`✅ [${device.name}] Gradient → ${colors}%`))
				.catch(err => error(`❌ [${device.name}] Gradient → ${colors}%: ${err.message}`))
		}));
	})
	.catch(error);