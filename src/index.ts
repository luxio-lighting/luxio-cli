#!/usr/bin/env node
import { Command } from 'commander';
import { Bonjour } from 'bonjour-service';
import { SerialPort } from 'serialport';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseParameters, updateParameters, type AnimationParameter } from '../shared/protocol/src/parameters.js';
import { colorSchema, configSchema, decodeResponse, encodeRequest, frame, FrameDecoder, requestHttp, type Request } from '../shared/protocol/src/index.js';

const program = new Command().name('luxio').description('Local control for Luxio lights').version('3.0.0')
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
async function sendPage(request: Omit<Request, 'id'>) {
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
async function send(request: Omit<Request, 'id'>) {
  if ([7, 8, 31].includes(request.operation) && request.script?.parameters?.length) {
    const requiredBuild = /^\s*-- @parameter [^,]+,\s*(Slider|Checkbox)\s*,/m.test(request.script.source) ? 21 : 14;
    if (((await sendPage({ operation: 0 })).state?.build ?? 0) < requiredBuild) throw new Error(`These animation parameters require firmware build ${requiredBuild} or newer`);
  }
  if ([1, 17, 20, 21, 23, 27, 28, 30].includes(request.operation)) {
    const state = (await sendPage({ operation: 0 })).state;
    if (!state) throw new Error('Unable to read device configuration');
    if ([17, 20, 21, 23].includes(request.operation) && state.config.ledCount <= 1) throw new Error('Gradients require more than one LED/controller');
    let colors = request.color ? [request.color] : request.savedColor ? [request.savedColor.color] : request.gradient?.colors ?? [];
    if (request.operation === 23) colors = (await sendPage({ operation: 19, gradientId: request.gradientId })).gradient?.colors ?? [];
    if (request.operation === 30) { const saved = (await sendPage({ operation: 26, colorId: request.colorId })).savedColor; if (saved) colors = [saved.color]; }
    for (const color of colors) {
      if (color.white && !['WS2814', 'SK6812'].includes(state.config.stripType)) throw new Error('The white channel requires an RGBW strip (WS2814 or SK6812)');
      if ((color.warmWhite || color.coolWhite) && state.config.stripType !== 'WS2805') throw new Error('Warm/cool white requires an RGBCCT strip (WS2805)');
    }
  }
  let result = await sendPage(request);
  if (![5, 18, 25].includes(request.operation)) return result;
  const listKey = request.operation === 5 ? 'scripts' : request.operation === 18 ? 'gradients' : 'colors';
  const nextKey = request.operation === 5 ? 'nextScriptOffset' : request.operation === 18 ? 'nextGradientOffset' : 'nextColorOffset';
  const offsetKey = request.operation === 5 ? 'scriptOffset' : request.operation === 18 ? 'gradientOffset' : 'colorOffset';
  const items = [...(result[listKey] ?? [])];
  let offset = request[offsetKey] ?? 0;
  while (result[nextKey]) {
    const next = result[nextKey]!;
    if (next <= offset || !result[listKey]?.length) throw new Error('Invalid library listing continuation');
    offset = next; result = await sendPage({ ...request, [offsetKey]: offset });
    items.push(...(result[listKey] ?? []));
  }
  return { ...result, [listKey]: items, [nextKey]: 0 };
}
const outputKeys: Record<string, string> = { scripts: 'animations', script: 'animation', activeScriptId: 'activeAnimationId', scriptName: 'animationName', nextScriptOffset: 'nextAnimationOffset' };
const outputReplacer = (_key: string, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [outputKeys[key] ?? key, item])) : value;
program.command('discover').action(async () => console.log(JSON.stringify(await discover(), outputReplacer, 2)));
program.command('state').action(async () => console.log(JSON.stringify(await send({ operation: 0 }), outputReplacer, 2)));
program.command('set-color <hex>').alias('set').description('Set a solid RGB color, e.g. ff0000; switches to Color mode').action(async value => {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[a-f\d]{6}$/i.test(hex)) throw new Error('Use a six-digit hex color, such as ff0000 or "#FF0000"');
  console.log(JSON.stringify(await send({ operation: 1, color: colorSchema.parse({ red: parseInt(hex.slice(0, 2), 16), green: parseInt(hex.slice(2, 4), 16), blue: parseInt(hex.slice(4, 6), 16) }) }), outputReplacer, 2));
});
program.command('set-gradient <colors>').description('Set 2–8 comma-separated RGB colors; switches to Gradient mode').action(async value => {
  const hexes: string[] = value.split(',').map((hex: string) => hex.trim().replace(/^#/, ''));
  if (hexes.length < 2 || hexes.length > 8 || hexes.some(hex => !/^[a-f\d]{6}$/i.test(hex))) {
    throw new Error('Use 2–8 comma-separated six-digit hex colors, such as ff0000,00ff00,0000ff');
  }
  const colors = hexes.map(hex => colorSchema.parse({ red: parseInt(hex.slice(0, 2), 16), green: parseInt(hex.slice(2, 4), 16), blue: parseInt(hex.slice(4, 6), 16) }));
  console.log(JSON.stringify(await send({ operation: 17, gradient: { id: '', name: '', colors } }), outputReplacer, 2));
});
program.command('set-animation <file>').description('Play a Lua animation from RAM without saving it on the device').option('--parameters <json>', 'Parameter values by name').action(async (file, options) => {
  const source = await readFile(file, 'utf8');
  if (!source.length || Buffer.byteLength(source) > 16384) throw new Error('Animation must contain 1–16384 bytes');
  let parameters = parseParameters(source);
  if (options.parameters) {
    const values = JSON.parse(options.parameters);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Parameters must be a JSON object');
    parameters = updateParameters(parameters, Object.entries(values).map(([name, value]) => {
      const parameter = parameters.find(p => p.name === name);
      if (!parameter || typeof value !== (parameter.boolean ? 'boolean' : 'number')) throw new Error(`Invalid parameter: ${name}`);
      return { ...parameter, value: typeof value === 'boolean' ? Number(value) : value as number };
    }));
  }
  console.log(JSON.stringify(await send({ operation: 31, script: { id: '', name: file.split('/').pop(), source, mode: 2, parameters } }), outputReplacer, 2));
});
program.command('colors').action(async () => console.log(JSON.stringify(await send({ operation: 25 }), outputReplacer, 2)));
program.command('gradients').action(async () => console.log(JSON.stringify(await send({ operation: 18 }), outputReplacer, 2)));
program.command('save-color <name> <hex>').option('--id <uuid>', 'Update an existing color').action(async (name, value, options) => {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[a-f\d]{6}$/i.test(hex)) throw new Error('Use a six-digit hex color');
  if (!name.trim() || Buffer.byteLength(name.trim()) > 63) throw new Error('Name must contain 1–63 bytes');
  const color = colorSchema.parse({ red: parseInt(hex.slice(0, 2), 16), green: parseInt(hex.slice(2, 4), 16), blue: parseInt(hex.slice(4, 6), 16) });
  console.log(JSON.stringify(await send({ operation: options.id ? 28 : 27, savedColor: { id: options.id ?? '', name: name.trim(), color } }), outputReplacer, 2));
});
program.command('save-gradient <name> <colors>').option('--id <uuid>', 'Update an existing gradient').action(async (name, value, options) => {
  const hexes: string[] = value.split(',').map((hex: string) => hex.trim().replace(/^#/, ''));
  if (hexes.length < 2 || hexes.length > 8 || hexes.some(hex => !/^[a-f\d]{6}$/i.test(hex))) throw new Error('Use 2–8 comma-separated six-digit hex colors');
  if (!name.trim() || Buffer.byteLength(name.trim()) > 63) throw new Error('Name must contain 1–63 bytes');
  const colors = hexes.map(hex => colorSchema.parse({ red: parseInt(hex.slice(0, 2), 16), green: parseInt(hex.slice(2, 4), 16), blue: parseInt(hex.slice(4, 6), 16) }));
  console.log(JSON.stringify(await send({ operation: options.id ? 21 : 20, gradient: { id: options.id ?? '', name: name.trim(), colors } }), outputReplacer, 2));
});
program.command('get-color <id>').action(async colorId => console.log(JSON.stringify(await send({ operation: 26, colorId }), outputReplacer, 2)));
program.command('get-gradient <id>').action(async gradientId => console.log(JSON.stringify(await send({ operation: 19, gradientId }), outputReplacer, 2)));
program.command('delete-color <id>').action(async colorId => console.log(JSON.stringify(await send({ operation: 29, colorId }), outputReplacer, 2)));
program.command('delete-gradient <id>').action(async gradientId => console.log(JSON.stringify(await send({ operation: 22, gradientId }), outputReplacer, 2)));
program.command('run-color <id>').action(async colorId => console.log(JSON.stringify(await send({ operation: 30, colorId }), outputReplacer, 2)));
program.command('run-gradient <id>').action(async gradientId => console.log(JSON.stringify(await send({ operation: 23, gradientId }), outputReplacer, 2)));
program.command('channels').option('--red <n>', '', '0').option('--green <n>', '', '0').option('--blue <n>', '', '0')
  .option('--white <n>', '', '0').option('--warm-white <n>', '', '0').option('--cool-white <n>', '', '0')
  .action(async options => console.log(JSON.stringify(await send({ operation: 1, color: colorSchema.parse(Object.fromEntries(Object.entries(options).map(([key, value]) => [key, Number(value)]))) }), outputReplacer, 2)));
program.command('brightness <value>').description('1–256; preserves power and the active mode').action(async value => {
  const brightness = Number(value);
  if (!Number.isInteger(brightness) || brightness < 1 || brightness > 256) throw new Error('Brightness must be 1–256');
  console.log(JSON.stringify(await send({ operation: 2, brightness }), outputReplacer, 2));
});
program.command('on').description('Turn on without changing brightness or mode').action(async () => console.log(JSON.stringify(await send({ operation: 15, on: true }), outputReplacer, 2)));
program.command('off').description('Turn off without changing brightness or mode').action(async () => console.log(JSON.stringify(await send({ operation: 15, on: false }), outputReplacer, 2)));
program.command('config <json>').description('Full configuration as JSON').action(async value => console.log(JSON.stringify(await send({ operation: 3, config: configSchema.parse(JSON.parse(value)) }), outputReplacer, 2)));
program.command('wifi <file>').description('Read SSID/password JSON from a local file (never command-line credentials)').action(async file => {
  const wifi = JSON.parse(await readFile(file, 'utf8'));
  if (typeof wifi.ssid !== 'string' || typeof wifi.password !== 'string') throw new Error('Expected ssid and password');
  await send({ operation: 4, wifi }); console.log('Wi-Fi configuration saved');
});
program.command('animations').description('List saved animations').action(async () => console.log(JSON.stringify(await send({ operation: 5 }), outputReplacer, 2)));
program.command('save-animation <file>').alias('upload').description('Save a Lua animation on the device').option('--name <name>', 'Animation name').option('--parameters <json>', 'Parameter values by name').option('--id <uuid>', 'Update an existing animation without changing its ID').action(async (file, options) => {
  const source = await readFile(file, 'utf8');
  let parameters = parseParameters(source);
  if (options.parameters) {
    const values = JSON.parse(options.parameters);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Parameters must be a JSON object');
    parameters = updateParameters(parameters, Object.entries(values).map(([name, value]) => {
      const parameter = parameters.find(p => p.name === name);
      if (!parameter || typeof value !== (parameter.boolean ? 'boolean' : 'number')) throw new Error(`Invalid parameter: ${name}`);
      return { ...parameter, value: typeof value === 'boolean' ? Number(value) : value as number };
    }));
  }
  console.log(JSON.stringify(await send({ operation: options.id ? 8 : 7, script: { id: options.id ?? randomUUID(), name: options.name ?? file.split('/').pop(), source, parameters } }), outputReplacer, 2));
});
program.command('set-parameters <json>').description('Change active animation parameters without restarting').option('--save', 'Also save values with the active saved animation').action(async (json, options) => {
  const values = JSON.parse(json);
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Parameters must be a JSON object');
  const state = (await send({ operation: 0 })).state;
  if (!state || state.mode !== 2) throw new Error('No animation is running');
  if (state.build < 14) throw new Error('Animation parameters require firmware build 14 or newer');
  if (options.save && !state.activeScriptId) throw new Error('Save the animation before saving parameter values');
  const definitions: AnimationParameter[] = state.parameters ?? [];
  const parameters = updateParameters(definitions, Object.entries(values).map(([name, value]) => {
    const parameter = definitions.find(p => p.name === name);
    if (!parameter || typeof value !== (parameter.boolean ? 'boolean' : 'number')) throw new Error(`Invalid parameter: ${name}`);
    return { ...parameter, value: typeof value === 'boolean' ? Number(value) : value as number };
  }));
  const result = await send({ operation: 32, scriptId: state.activeScriptId || undefined, script: state.activeScriptId ? undefined : { id: '', name: state.scriptName ?? '', source: '' }, parameters });
  if (options.save) {
    const animation = (await send({ operation: 6, scriptId: state.activeScriptId })).script;
    if (!animation) throw new Error('Animation not found');
    await send({ operation: 8, script: { ...animation, parameters } });
  }
  console.log(JSON.stringify(result, outputReplacer, 2));
});
program.command('get-animation <id>').description('Read a saved animation’s Lua source').action(async scriptId => console.log((await send({ operation: 6, scriptId })).script?.source));
program.command('delete-animation <id>').description('Delete a saved animation').action(async scriptId => console.log(JSON.stringify(await send({ operation: 9, scriptId }), outputReplacer, 2)));
program.command('run-animation <id>').alias('run').description('Play a saved animation').action(async scriptId => console.log(JSON.stringify(await send({ operation: 10, scriptId }), outputReplacer, 2)));
program.command('stop').action(async () => { const state = (await send({ operation: 0 })).state; console.log(JSON.stringify(await send({ operation: state?.mode === 1 ? 24 : 11 }), outputReplacer, 2)); });
program.command('pairing').action(async () => console.log(JSON.stringify(await send({ operation: 12 }), outputReplacer, 2)));
program.command('check-update').description('Check for updates without installing').action(async () => {
  let result = await send({ operation: 13 });
  for (let attempt = 0; result.updateChecking && attempt < 45; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    result = await send({ operation: 0 });
  }
  if (result.updateChecking) throw new Error('Update check timed out');
  if (result.updateError) throw new Error(result.updateError);
  console.log(JSON.stringify(result, outputReplacer, 2));
});
program.command('update').description('Manually install the checked update; the device goes offline during recovery').action(async () => {
  await send({ operation: 14 });
  console.log('Update requested. Keep the device powered on while recovery downloads and installs the firmware.');
});
try { await program.parseAsync(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { if (serialPort?.isOpen) await new Promise<void>(resolve => serialPort!.close(() => resolve())); }
