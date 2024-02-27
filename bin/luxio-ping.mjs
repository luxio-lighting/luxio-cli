import { log, error, getDevices } from './helpers.mjs';

getDevices()
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			await device.system.ping()
				.then(result => log(`✅ [${device.name}] Ping -> ${result}`))
				.catch(err => error(`❌ [${device.name}] Ping → Error: ${err.message}`))
		}));
	})
	.catch(error);