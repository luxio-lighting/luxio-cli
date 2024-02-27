import { log, error, getDevices } from './helpers.mjs';

getDevices()
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			await device.system.restart()
				.then(() => log(`✅ [${device.name}] Restart -> OK`))
				.catch(err => error(`❌ [${device.name}] Restart → Error: ${err.message}`))
		}));
	})
	.catch(error);