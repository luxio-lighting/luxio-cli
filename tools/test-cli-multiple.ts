import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { Device } from '../shared/device/src/device.js';
import { decodeRequest, encodeResponse } from '../shared/protocol/src/index.js';

const devices = [new Device('first'), new Device('second')];
devices[0].state.config.name = 'First light'; devices[0].state.config.stripType = 'WS2812'; devices[0].state.config.gpio = 4;
devices[1].state.config.name = 'Second light'; devices[1].state.config.stripType = 'WS2814'; devices[1].state.config.gpio = 5;
devices[0].state.on = false; devices[1].state.on = true;
const operations: number[][] = [[], []];
let discoveries = 0;
const servers = devices.map((device, index) => createServer(async (request, response) => {
  if (request.url === '/devices') {
    discoveries++; response.setHeader('Content-Type', 'application/json'); response.end('[]'); return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const message = decodeRequest(Buffer.concat(chunks)); operations[index].push(message.operation);
  response.setHeader('Content-Type', 'application/x-protobuf'); response.end(encodeResponse(device.handle(message)));
}));

try {
  for (const server of servers) await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const services = servers.map((server, index) => ({
    name: devices[index].state.config.name, addresses: ['127.0.0.1'], port: (server.address() as { port: number }).port,
    txt: { id: devices[index].state.deviceId },
  }));
  const api = `http://127.0.0.1:${services[0].port}`;
  await mkdir('.sdk', { recursive: true });
  // Isolate mDNS completely so wildcard tests can never discover or modify real lights.
  const bonjourMock = `export class Bonjour {
    find(options, callback) {
      queueMicrotask(() => JSON.parse(process.env.LUXIO_TEST_SERVICES).forEach(callback));
      return { stop() {} };
    }
    destroy() {}
  }`;
  await writeFile('.sdk/wildcard-loader.mjs', `export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'bonjour-service') return { url: ${JSON.stringify('data:text/javascript,' + encodeURIComponent(bonjourMock))}, shortCircuit: true };
    return nextResolve(specifier, context);
  }`);
  const bootstrap = 'data:text/javascript,' + encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(new URL('../.sdk/wildcard-loader.mjs', import.meta.url).href)});`);
  for (let index = 0; index < devices.length; index++) {
    for (let item = 0; item < (index === 0 ? 70 : 2); item++) {
      const result = devices[index].handle({ id: item + 1, operation: 7, script: { id: '', name: `Device ${index} animation ${item}`, source: 'function loop() end' } });
      assert.ok(result.script, result.error);
    }
  }

  for (const entry of [
    { args: ['--device', '*', 'brightness', 'set', '80%'], scenario: 'brightness', code: 0 },
    { args: ['config', 'channel', 'set', '40'], scenario: 'config', code: 0 },
    { args: ['channels', '--white', '255', '--device=*'], scenario: 'partial failure', code: 1 },
    { args: ['--device', '*', 'animations'], scenario: 'pagination', code: 0 },
    { args: ['brightness', 'get', '--device', '*'], scenario: 'getter', code: 0 },
    { args: ['--device', '*', 'on', 'set', 'no'], scenario: 'power', code: 0 },
    { args: ['--device', '*', 'state', 'get'], scenario: 'empty discovery', code: 1 },
    { args: ['--device', '*', 'brightness', '--help'], scenario: 'help', code: 0 },
    { args: ['--device', '*', 'discover'], scenario: 'discover', code: 0 },
    { args: ['state', 'get'], scenario: 'implicit multiple', code: 1 },
    { args: ['state', 'get'], scenario: 'implicit single', code: 0 },
  ]) {
    const beforeDiscoveries = discoveries, beforeOperations = operations.map(items => items.length);
    const child = spawn(process.execPath, ['--import', bootstrap, 'dist/index.js', '--api', api, ...entry.args], {
      env: { ...process.env, LUXIO_DEVICE: entry.scenario === 'config' ? '*' : '',
        LUXIO_TEST_SERVICES: JSON.stringify(entry.scenario === 'empty discovery' ? [] : entry.scenario === 'implicit single' ? services.slice(0, 1) : [...services, services[0]]) },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, entry.code, `${entry.scenario}: ${stderr}`);
    assert.equal(discoveries - beforeDiscoveries, entry.scenario === 'help' ? 0 : 1, 'Discover once per invocation');
    const sent = operations.map((items, index) => items.slice(beforeOperations[index]));
    if (['brightness', 'config', 'partial failure', 'pagination', 'getter', 'power'].includes(entry.scenario)) {
      for (const service of services) assert.equal(stdout.split(`[${service.name} (${service.txt.id}) — http://127.0.0.1:${service.port}]`).length - 1, 1, 'One labelled result per unique device');
    }
    if (entry.scenario === 'brightness') {
      assert.deepEqual(devices.map(device => device.state.brightness), [205, 205]);
      assert.deepEqual(devices.map(device => device.state.on), [false, true]); assert.deepEqual(sent, [[2], [2]]);
    } else if (entry.scenario === 'config') {
      assert.deepEqual(devices.map(device => device.state.config.channel), [40, 40]);
      assert.deepEqual(devices.map(device => device.state.config.gpio), [4, 5]);
      assert.deepEqual(devices.map(device => device.state.config.stripType), ['WS2812', 'WS2814']); assert.deepEqual(sent, [[0, 3], [0, 3]]);
    } else if (entry.scenario === 'partial failure') {
      assert.match(stderr, /First light \(first\).*white channel requires/);
      assert.equal(devices[0].state.color.white, 0); assert.equal(devices[1].state.color.white, 255); assert.deepEqual(sent, [[0], [0, 1]]);
    } else if (entry.scenario === 'pagination') {
      const results = stdout.split(/^\[.*\]\n/m).slice(1).map(value => JSON.parse(value));
      assert.deepEqual(results.map(result => result.animations.length), [70, 2]); assert.deepEqual(sent, [[5, 5], [5]]);
      assert.ok(results[0].animations.every((animation: { name: string }) => animation.name.startsWith('Device 0')));
      assert.ok(results[1].animations.every((animation: { name: string }) => animation.name.startsWith('Device 1')));
    } else if (entry.scenario === 'getter') {
      assert.equal(stdout.split('80%\n').length - 1, 2); assert.deepEqual(sent, [[0], [0]]);
    } else if (entry.scenario === 'power') {
      assert.deepEqual(devices.map(device => device.state.on), [false, false]); assert.deepEqual(sent, [[15], [15]]);
    } else if (entry.scenario === 'empty discovery') {
      assert.match(stderr, /No lights found/); assert.deepEqual(sent, [[], []]);
    } else if (entry.scenario === 'implicit multiple') {
      assert.match(stderr, /Several lights found/); assert.deepEqual(sent, [[], []]);
    } else if (entry.scenario === 'implicit single') {
      assert.equal(JSON.parse(stdout).state.deviceId, 'first'); assert.deepEqual(sent, [[0], []]);
    } else {
      if (entry.scenario === 'discover') assert.equal(JSON.parse(stdout).length, 2);
      else assert.match(stdout, /Usage: luxio brightness/);
      assert.deepEqual(sent, [[], []]);
    }
    console.log(`PASS: multiple devices — ${entry.scenario}`);
  }
} finally {
  for (const server of servers) server.close();
  for (const device of devices) device.animation?.close();
}
