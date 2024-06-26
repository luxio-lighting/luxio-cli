import { LuxioDiscovery } from '@luxio-lighting/lib';
import Table from 'cli-table';
import chalk from 'chalk';

const discovery = new LuxioDiscovery();
discovery.setDebugEnabled(true);
discovery.discoverDevices()
	.then(devices => {
		const devicesArray = Object.values(devices);

		let table = new Table({
			head: [
				'ID',
				'Address',
				'Version',
				'Name',
			].map(str => chalk.cyan(str))
		});

		devicesArray.sort((a, b) => {
			return b.lastseen - a.lastseen;
		})

		devicesArray.forEach(device => {
			table.push([
				device.id,
				device.address,
				device.version,
				device.name,
			].map(prop => {
				if (typeof prop === 'undefined' || prop === null)
					return '-';

				try {
					return String(prop);
				} catch (err) {
					return '-';
				}
			}))
		})

		console.log(table.toString());
	})
	.catch(console.error);