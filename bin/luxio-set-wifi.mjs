import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-s, --ssid <ssid>', 'Wi-Fi SSID');
program.requiredOption('-p, --pass <pass>', 'Wi-Fi Password');

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			const ssid = program.getOptionValue('ssid');
			const pass = program.getOptionValue('pass');

			await device.wifi.connect({
				ssid,
				pass,
			})
				.then(() => log(`✅ [${device.name}] Wi-Fi → ${ssid}`))
				.catch(err => error(`❌ [${device.name}] Wi-Fi → ${ssid}: ${err.message}`))
		}));
	})
	.catch(error);