import Table from 'cli-table';
import chalk from 'chalk';
import { log, error, getDevices } from './helpers.mjs';

getDevices({
	unique: true,
})
	.then(async devices => {
		await devices.forEach(async device => {
			await device.getWifiNetworks()
				.then(networks => {
					log('');
					log(chalk.bold.white(` ${device.name} `));

					let table = new Table({
						head: [
							'SSID',
							'RSSI',
							'Security',
						].map(str => chalk.cyan(str))
					});

					networks.forEach(network => {
						table.push([
							network.ssid,
							network.rssi,
							(typeof network.security !== 'undefined') ? network.security ? network.security : 'open' : '-',
						]);
					});

					log(table.toString());

				})
				.catch(err => error(`Could not get Wi-Fi networks: ${err.message}`));
		})
	})
	.catch(error);