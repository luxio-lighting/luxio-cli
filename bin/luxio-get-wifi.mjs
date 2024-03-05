import Table from 'cli-table';
import chalk from 'chalk';
import { log, error, getDevices } from './helpers.mjs';

getDevices({
	unique: true,
})
	.then(async devices => {
		await Promise.all(devices.map(async device => {

			try {
				await device.connect();
				await device.wifi.scanNetworks();
				const networks = await new Promise((resolve, reject) => {
					device.addEventListener('wifi.networks', networks => {
						resolve(networks);
					});
				});
				await device.disconnect();

				log('');
				log(chalk.bold.white(` ${device.name} `));
				let table = new Table({
					head: [
						'BSSID',
						'SSID',
						'RSSI',
						'Encryption',
					].map(str => chalk.cyan(str))
				});

				networks.forEach(network => {
					table.push([
						network.bssid,
						network.ssid,
						network.rssi,
						network.encryption,
					]);
				});

				log(table.toString());
			} catch (err) {
				log('');
				log(chalk.bold.white(` ${device.name} `));
				log(chalk.red(`❌ Could not get Wi-Fi networks: ${err.message}`));
			}
		}));
	})
	.catch(error);