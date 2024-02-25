import { program } from 'commander';
import { log, error, getDevices } from './helpers.mjs';

program.requiredOption('-c, --colors <colors>', 'Colors, seperated by a comma, e.g. #FF000000,#00FF0000,#0000FF00,#000000FF');

getDevices()
	.then(async devices => {
		let colors = program.getOptionValue('colors');
		colors = colors.split(',')
			.map(color => color.trim())
			.map(color => {
				if (!color.startsWith('#')) {
					error('Invalid color format. Use HEX format: #FFFFFFFF');
				}

				const r = parseInt(color.substr(1, 2), 16);
				const g = parseInt(color.substr(3, 2), 16);
				const b = parseInt(color.substr(5, 2), 16);
				let w = parseInt(color.substr(7, 2), 16);
				if (Number.isNaN(w)) w = 0;

				return { r, g, b, w };
			});

		await Promise.all(devices.map(async device => {
			await device.led.setGradient({ colors })
				.then(() => log(`✅ [${device.name}] Gradient → OK`))
				.catch(err => error(`❌ [${device.name}] Gradient: ${err.message}`))
		}));
	})
	.catch(error);