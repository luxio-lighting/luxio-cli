import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-t, --temperature <temperature>', 'Temperature, a number between 0 (cool) and 1 (warm)');

getDevices()
	.then(devices => {
		const temperature = program.getOptionValue('temperature');

		return devices.forEach(device => {
			device.colorTemperature = parseFloat(temperature);
			device.on = true;
			device.sync()
				.then(() => log(`✅ [${device.name}] Temperature → ${temperature}`))
				.catch(err => error(`❌ [${device.name}] Temperature → ${temperature}: ${err.message}`))
		})
	})
	.catch(error);