'use strict';

import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-i, --id <id>', 'ID of the effect');

getDevices()
	.then(devices => {
		const effectId = program.getOptionValue('id');

		return devices.forEach(device => {
			device.effect = effectId;
			device.on = true;
			device.sync()
				.then(() => log(`✅ [${device.name}] Effect → ${effectId}`))
				.catch(err => error(`❌ [${device.name}] Effect → ${effectId}: ${err.message}`))
		})
	})
	.catch(error);