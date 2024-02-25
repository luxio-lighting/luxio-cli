import { log, error, getDevices } from './helpers.mjs';

getDevices()
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			await device.led.setOn({ on: true })
				.then(() => log(`✅ [${device.name}] Turn On → OK`))
				.catch(err => error(`❌ [${device.name}] Turn On → Error: ${err.message}`))
		}));
	})
	.catch(error);