import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			await device.connect();
			// TODO
			// device.sync()
			// 	.then(() => log(`✅ [${oldName}] Name → ${newName}`))
			// 	.catch(err => error(`❌ [${oldName}] Name → ${newName}: ${err.message}`))
		}));
	})
	.catch(error);