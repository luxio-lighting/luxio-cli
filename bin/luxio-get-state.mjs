import { log, error, getDevices } from './helpers.mjs';
import Table from 'cli-table';
import chalk from 'chalk';

getDevices({
	sync: true,
})
	.then(async devices => {
		devices.forEach(device => {
			log('');
			log(chalk.bold.white(` ${device.name} (${device.id})`));

			let table = new Table({
				head: [
					'On',
					'Brightness',
					'Mode',
					'Gradient',
					'Effect',
					'Wi-Fi SSID',
					'Connectivity',
				].map(str => chalk.cyan(str))
			});

			table.push([
				device.on ? 'Yes' : 'No',
				`${Math.round(device.brightness * 100)}%`,
				device.mode,
				device.gradient ? device.gradient.join(',') : '-',
				device.effect ? device.effect : '-',
				device.wifi.ssid,
				device.connectivity,
			])

			console.log(table.toString());
		})
	})
	.catch(error);