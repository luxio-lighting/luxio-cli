import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-n, --name <name>', 'New name of the device');

getDevices({
	unique: true,
})
	.then(async devices => {
		const name = program.getOptionValue('name');

		await Promise.all(devices.map(async device => {
			await device.system.setName({ name })
				.then(() => log(`✅ [${device.name}] Name → ${name}`))
				.catch(err => error(`❌ [${device.name}] Name → ${name}: ${err.message}`))
		}));
	})
	.catch(error);