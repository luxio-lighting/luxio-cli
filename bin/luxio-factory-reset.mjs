import { log, error, getDevices } from './helpers.mjs';

getDevices()
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			await device.system.factoryReset()
				.then(() => log(`✅ [${device.name}] Factory Reset -> OK`))
				.catch(err => error(`❌ [${device.name}] Factory Reset → Error: ${err.message}`))
		}));
	})
	.catch(error);