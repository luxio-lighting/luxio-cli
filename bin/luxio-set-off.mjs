import { log, error, getDevices } from './helpers.mjs';

getDevices()
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			await device.led.setOn({ on: false })
				.then(() => log(`✅ [${device.name}] Turn Off → OK`))
				.catch(err => error(`❌ [${device.name}] Turn Off → Error: ${err.message}`))
		}));
	})
	.catch(error);