'use strict';

import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-i, --id <id>', 'ID of the animation');

getDevices()
	.then(devices => {
		const id = program.getOptionValue('id');

		return devices.forEach(device => {
			device.led.setAnimation({ id })
				.then(() => log(`✅ [${device.name}] Animation → ${id}`))
				.catch(err => error(`❌ [${device.name}] Animation → ${id}: ${err.message}`))
		})
	})
	.catch(error);