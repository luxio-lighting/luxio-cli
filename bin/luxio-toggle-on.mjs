import { log, error, getDevices } from './helpers.mjs';

getDevices()
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			const { on } = await device.led.getState()
			await device.led.setOn({ on: !on })
				.then(() => log(`✅ [${device.name}] Toggle On → OK`))
				.catch(err => error(`❌ [${device.name}] Toggle On → Error: ${err.message}`))
		}));
	})
	.catch(error);