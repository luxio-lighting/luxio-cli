import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-n, --name <name>', 'New name of the device');

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			const oldName = device.name;
			const newName = program.getOptionValue('name');

			device.name = newName;
			device.sync()
				.then(() => log(`✅ [${oldName}] Name → ${newName}`))
				.catch(err => error(`❌ [${oldName}] Name → ${newName}: ${err.message}`))
		}));
	})
	.catch(error);