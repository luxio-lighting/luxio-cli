import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

getDevices({
	unique: true,
	debug: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {
			await device.connect();
		}));
	})
	.catch(error);