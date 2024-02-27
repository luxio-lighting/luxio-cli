import util from 'node:util';
import { log, error, getDevices } from './helpers.mjs';

getDevices()
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			try {
				const state = await device.getFullState();
				log(`✅ [${device.name}] Get State → ${util.inspect(state, { depth: null, colors: true })}`);
			} catch (err) {
				error(`❌ [${device.name}] Get State → Error: ${err.message}`);
			}
		}));
	})
	.catch(error);