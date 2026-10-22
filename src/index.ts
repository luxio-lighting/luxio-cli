#!/usr/bin/env node
import { Command } from 'commander';
import { Bonjour } from 'bonjour-service';
import { SerialPort } from 'serialport';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { colorSchema, configSchema, decodeResponse, encodeRequest, frame, FrameDecoder, requestHttp, type Request } from '../shared/protocol/src/index.js';

const program = new Command().name('luxio').description('Local control for Luxio lights').version('0.1.1')
  .option('--device <name-or-address>', 'Device name, LAN address, or serial path', process.env.LUXIO_DEVICE)
  .option('--api <url>', 'Discovery API', process.env.LUXIO_API_URL ?? 'https://api.luxio.lighting');
async function discover() {
  const found = new Map<string, { name: string; address: string; deviceId: string; source: string }>();
  const bonjour = new Bonjour();
  const browser = bonjour.find({ type: 'luxio' }, service => {
    const ip = service.addresses?.find(value => /^\d+\./.test(value)) ?? service.host;
    const id = String(service.txt?.id ?? service.fqdn);
    found.set(id, { name: service.name, address: `http://${ip}:${service.port}`, deviceId: id, source: 'mDNS' });
  });
  const cloud = (async () => {
    try {
      const result = await fetch(`${program.opts().api}/devices`, { signal: AbortSignal.timeout(3500) });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      for (const device of await result.json() as any[]) {
        if (!found.has(device.deviceId)) found.set(device.deviceId, { name: device.name, address: `http://${device.lan_ip.includes(':') ? `[${device.lan_ip}]` : device.lan_ip}`, deviceId: device.deviceId, source: 'cloud' });
      }
    } catch (error) { process.stderr.write(`Cloud discovery unavailable: ${error instanceof Error ? error.message : error}\n`); }
  })();
  await Promise.all([cloud, new Promise(resolve => setTimeout(resolve, 3500))]);
  browser.stop(); bonjour.destroy(); return [...found.values()];
}
let resolvedTarget: string | undefined;
let serialPort: SerialPort | undefined;
async function send(request: Omit<Request, 'id'>) {
  let target: string = resolvedTarget ?? program.opts().device;
  if (!target) {
    const devices = await discover();
    if (devices.length !== 1) throw new Error(devices.length ? 'Several lights found; select one with --device or LUXIO_DEVICE' : 'No lights found; select an address with --device or LUXIO_DEVICE');
    target = devices[0].address;
  }
  resolvedTarget = target;
  const message = { ...request, id: Math.floor(Math.random() * 0xfffffffe) + 1 };
  if (target.startsWith('/dev/') || /^COM\d+$/i.test(target)) {
    if (!serialPort) {
      serialPort = new SerialPort({ path: target, baudRate: 115200, autoOpen: false });
      const port = serialPort;
      await new Promise<void>((resolve, reject) => port.open(error => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => port.set({ dtr: true, rts: false }, error => error ? reject(error) : resolve()));
      // Native USB CDC needs the host-ready line before firmware can reply.
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const port = serialPort;
    try {
      return await new Promise<any>((resolve, reject) => {
        const parser = new FrameDecoder();
        const timeout = setTimeout(() => reject(new Error(`Serial request timed out (operation ${message.operation})`)), 15000);
        port.on('error', error => { clearTimeout(timeout); reject(error); });
        port.on('data', chunk => {
          try {
            for (const bytes of parser.push(chunk)) {
              const result = decodeResponse(bytes);
              if (result.id !== message.id) continue;
              clearTimeout(timeout);
              if (result.error) reject(new Error(result.error)); else resolve(result);
            }
          } catch (error) { clearTimeout(timeout); reject(error); }
        });
        // ESP32 USB CDC defaults to a 256-byte receive queue. Pace large Lua
        // uploads so rendering frames cannot cause the receive queue to overflow.
        void (async () => {
          const bytes = frame(encodeRequest(message));
          for (let offset = 0; offset < bytes.length; offset += 128) {
            await new Promise<void>((resolve, reject) => port.write(bytes.subarray(offset, offset + 128), error => error ? reject(error) : resolve()));
            await new Promise<void>((resolve, reject) => port.drain(error => error ? reject(error) : resolve()));
            if (offset + 128 < bytes.length) await new Promise(resolve => setTimeout(resolve, 10));
          }
        })().catch(error => { clearTimeout(timeout); reject(error); });
      });
    } finally { port.removeAllListeners('data'); port.removeAllListeners('error'); }
  }
  if (!/^https?:\/\//.test(target) && !/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(target) && !target.includes('.local')) {
    const matches = (await discover()).filter(device => device.name === target || device.deviceId === target);
    if (matches.length !== 1) throw new Error(matches.length ? 'Several devices have that name; use an address or Device ID' : 'Device not found');
    target = matches[0].address; resolvedTarget = target;
  }
  return requestHttp(target, message);
}
program.command('discover').action(async () => console.log(JSON.stringify(await discover(), null, 2)));
program.command('state').action(async () => console.log(JSON.stringify(await send({ operation: 0 }), null, 2)));
program.command('set-color <hex>').alias('set').description('Set a solid RGB color, e.g. ff0000; switches to Color mode').action(async value => {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[a-f\d]{6}$/i.test(hex)) throw new Error('Use a six-digit hex color, such as ff0000 or "#FF0000"');
  console.log(JSON.stringify(await send({ operation: 1, color: colorSchema.parse({ red: parseInt(hex.slice(0, 2), 16), green: parseInt(hex.slice(2, 4), 16), blue: parseInt(hex.slice(4, 6), 16) }) }), null, 2));
});
program.command('set-gradient <colors>').description('Set 2–8 comma-separated RGB colors; switches to Gradient mode').action(async value => {
  const hexes: string[] = value.split(',').map((hex: string) => hex.trim().replace(/^#/, ''));
  if (hexes.length < 2 || hexes.length > 8 || hexes.some(hex => !/^[a-f\d]{6}$/i.test(hex))) {
    throw new Error('Use 2–8 comma-separated six-digit hex colors, such as ff0000,00ff00,0000ff');
  }
  const colors = hexes.map(hex => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]);
  const state = (await send({ operation: 0 })).state;
  if (!state || state.build < 5) throw new Error('Gradient mode requires firmware build 5 or newer');
  const source = `function setup()
  local stops = {${colors.map(color => `{${color.join(',')}}`).join(',')}}
  local count = luxio_get_pixel_count()
  for i = 0, count - 1 do
    local position = i / math.max(count - 1, 1) * (#stops - 1)
    local segment = math.min(math.floor(position) + 1, #stops - 1)
    local t = position - (segment - 1)
    local a, b = stops[segment], stops[segment + 1]
    luxio_set_pixel_color(i,
      math.floor(a[1] + (b[1] - a[1]) * t + 0.5),
      math.floor(a[2] + (b[2] - a[2]) * t + 0.5),
      math.floor(a[3] + (b[3] - a[3]) * t + 0.5), 0, 0, 0)
  end
end
function loop() end`;
  const name = 'Luxio · CLI gradient';
  const existing = (await send({ operation: 5 })).scripts.find((script: { name: string }) => script.name === name);
  const saved = await send({ operation: existing ? 8 : 7, script: { id: existing?.id ?? randomUUID(), name, source, mode: 1 } });
  if (!saved.script?.id) throw new Error('Device did not return the saved gradient ID');
  console.log(JSON.stringify(await send({ operation: 10, scriptId: saved.script.id }), null, 2));
});
program.command('channels').option('--red <n>', '', '0').option('--green <n>', '', '0').option('--blue <n>', '', '0')
  .option('--white <n>', '', '0').option('--warm-white <n>', '', '0').option('--cool-white <n>', '', '0')
  .action(async options => console.log(JSON.stringify(await send({ operation: 1, color: colorSchema.parse(Object.fromEntries(Object.entries(options).map(([key, value]) => [key, Number(value)]))) }), null, 2)));
program.command('brightness <value>').description('0–255; preserves the active mode').action(async value => {
  const brightness = Number(value);
  if (!Number.isInteger(brightness) || brightness < 0 || brightness > 255) throw new Error('Brightness must be 0–255');
  console.log(JSON.stringify(await send({ operation: 2, brightness }), null, 2));
});
program.command('config <json>').description('Full configuration as JSON').action(async value => console.log(JSON.stringify(await send({ operation: 3, config: configSchema.parse(JSON.parse(value)) }), null, 2)));
program.command('wifi <file>').description('Read SSID/password JSON from a local file (never command-line credentials)').action(async file => {
  const wifi = JSON.parse(await readFile(file, 'utf8'));
  if (typeof wifi.ssid !== 'string' || typeof wifi.password !== 'string') throw new Error('Expected ssid and password');
  await send({ operation: 4, wifi }); console.log('Wi-Fi configuration saved');
});
program.command('scripts').action(async () => console.log(JSON.stringify(await send({ operation: 5 }), null, 2)));
program.command('upload <file>').option('--name <name>', 'Script name').option('--id <uuid>', 'Update an existing script without changing its ID').action(async (file, options) => {
  const source = await readFile(file, 'utf8');
  console.log(JSON.stringify(await send({ operation: options.id ? 8 : 7, script: { id: options.id ?? randomUUID(), name: options.name ?? file.split('/').pop(), source } }), null, 2));
});
program.command('get-script <id>').action(async scriptId => console.log((await send({ operation: 6, scriptId })).script?.source));
program.command('delete-script <id>').action(async scriptId => console.log(JSON.stringify(await send({ operation: 9, scriptId }), null, 2)));
program.command('run <id>').action(async scriptId => console.log(JSON.stringify(await send({ operation: 10, scriptId }), null, 2)));
program.command('stop').action(async () => console.log(JSON.stringify(await send({ operation: 11 }), null, 2)));
program.command('pairing').action(async () => console.log(JSON.stringify(await send({ operation: 12 }), null, 2)));
program.command('check-update').description('Check for updates without installing').action(async () => {
  let result = await send({ operation: 13 });
  for (let attempt = 0; result.updateChecking && attempt < 45; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    result = await send({ operation: 0 });
  }
  if (result.updateChecking) throw new Error('Update check timed out');
  if (result.updateError) throw new Error(result.updateError);
  console.log(JSON.stringify(result, null, 2));
});
program.command('update').description('Manually install the checked update; the device goes offline during recovery').action(async () => {
  await send({ operation: 14 });
  console.log('Update requested. Keep the device powered on while recovery downloads and installs the firmware.');
});
try { await program.parseAsync(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { if (serialPort?.isOpen) await new Promise<void>(resolve => serialPort!.close(() => resolve())); }
