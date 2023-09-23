import { program } from 'commander';
import { LuxioDiscovery } from '@luxio-lighting/lib';

export const log = (...props) => {
	console.log(...props);
}

export const error = err => {
	const message = (err instanceof Error)
		? err.stack ?? err.message ?? err.toString()
		: String(err);

	console.error(message);
	process.exit(1);
}

export const getDevices = async ({
	sync = false,
	unique = false,
} = {}) => {
	if (unique) {
		program.requiredOption('-d, --device <id>', 'ID or Name of the device');
	} else {
		program.option('-d, --device <id>', 'ID or Name of the device', '*');
	}
	program.parse();

	const deviceId = program.getOptionValue('device');

	const discovery = new LuxioDiscovery();
	return discovery.discoverDevices()
		.then(async devices => {
			devices = Object.values(devices);

			if (deviceId === '*') {
				return devices;
			}

			return devices.filter(device => {
				if (device.id === deviceId) return true;
				if (device.name === deviceId) return true;
				return false;
			})
		})
		.then(async devices => {
			if (sync) {
				await Promise.all(devices.map(async device => {
					await device.sync().catch(err => null);
				}));
			}

			if (unique) {
				if (Object.keys(devices).length !== 1) {
					error(`Device not found: ${deviceId}`);
				}
			}

			return devices;
		});
};