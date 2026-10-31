import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { Device } from '../shared/device/src/device.js';
import { decodeRequest, encodeResponse, type Request } from '../shared/protocol/src/index.js';

const device = new Device('cli-test'); device.state.build = 21; device.state.brightness = 256;
device.state.config.relay = null;
let requests = 0;
const requestLog: Request[] = [];
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  requests++;
  response.setHeader('Content-Type', 'application/x-protobuf');
  const message = decodeRequest(Buffer.concat(chunks));
  requestLog.push(message);
  // Physical-only operations use protocol fixtures; no real device is contacted.
  const result = message.operation === 4 ? { id: message.id }
    : message.operation === 12 ? { id: message.id, pairingCode: '12345678901', pairingQr: 'MT:test' }
    : message.operation === 13 ? { id: message.id, availableBuild: 22, updateChecking: false }
    : message.operation === 14 ? { id: message.id }
    : device.handle(message);
  if (message.operation === 0) Object.assign(result, { networkStatus: { connected: true, ssid: 'Test network', rssi: -45 } });
  response.end(encodeResponse(result));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address() as { port: number };
const target = `127.0.0.1:${address.port}`;
const cases = [
  { args: ['set-color', 'ff0000'], mode: 0, color: [255, 0, 0] },
  { args: ['set-color', '#Aa11Bb'], mode: 0, color: [170, 17, 187] },
  { args: ['set', '#00FF00'], mode: 0, color: [0, 255, 0] },
  { args: ['set-gradient', 'Ff0000,00ff00,0000ff'], mode: 1 },
  { args: ['set-gradient', ' #102030 , 001122 '], mode: 1 },
  { args: ['set-color', '0000ff'], mode: 0, color: [0, 0, 255] },
  { args: ['set-color', 'fff'], error: true },
  { args: ['set-color', 'GG0000'], error: true },
  { args: ['set-gradient', 'ff0000'], error: true },
  { args: ['set-gradient', 'ff0000,,00ff00'], error: true },
  { args: ['set-gradient', Array(9).fill('ff0000').join(',')], error: true },
  { args: ['set-gradient', '#aA00FF,#00FFaa'], mode: 1 },
];
let gradientId: string | undefined;
try {
  for (const entry of cases) {
    const before = requests;
    // Exercise both explicit device flags and the environment default.
    const child = spawn(process.execPath, ['dist/index.js', ...(entry.args[0] === 'set' ? ['--device', target] : []), ...entry.args], { env: { ...process.env, LUXIO_DEVICE: target } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    if (entry.error) {
      assert.equal(code, 1); assert.match(stderr, /six-digit/); assert.equal(requests, before, 'Invalid input must not contact the device');
    } else {
      assert.equal(code, 0, stderr); const result = JSON.parse(stdout); assert.equal(result.state.mode, entry.mode);
      assert.equal(device.state.brightness, 256);
      if (entry.color) assert.deepEqual(Object.values(device.state.color).slice(0, 3), entry.color);
      if (entry.args[0] === 'set-gradient') {
        assert.equal(device.state.activeScriptId, ''); assert.equal(device.state.activeGradientId, ''); assert.equal(device.gradients.length, 0);
        const pixels = device.output();
        const hexes = entry.args[1].split(',').map(v => v.trim().replace(/^#/, ''));
        const first = hexes[0], last = hexes.at(-1)!;
        assert.deepEqual(Object.values(pixels[0]), [parseInt(first.slice(0, 2), 16), parseInt(first.slice(2, 4), 16), parseInt(first.slice(4, 6), 16), 0, 0, 0]);
        assert.deepEqual(Object.values(pixels.at(-1)!), [parseInt(last.slice(0, 2), 16), parseInt(last.slice(2, 4), 16), parseInt(last.slice(4, 6), 16), 0, 0, 0]);
        assert.deepEqual(device.output(), pixels, 'Gradient must remain still');
        assert.equal(device.scripts.length, 0);
      }
    }
    console.log(`PASS: luxio ${entry.args.join(' ')}`);
  }
  for (let i = 0; i < 150; i++) {
    const created = device.handle({ id: 1000 + i, operation: 7, script: { id: '', name: `Saved ${i}`, source: 'function setup() end function loop() end', mode: 2 } });
    assert.ok(created.script, created.error);
  }
  for (const value of ['false', 'true', '0', '1', 'no', 'yes', 'maybe', '2']) {
    const before = requests, previous = structuredClone(device.state);
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, 'on', 'set', value]);
    let stderr = ''; child.stderr.on('data', data => { stderr += data; }); child.stdout.resume();
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    const invalid = value === 'maybe' || value === '2';
    assert.equal(code, invalid ? 1 : 0, stderr);
    if (invalid) { assert.match(stderr, /true\|1\|yes/); assert.equal(requests, before); }
    else { previous.on = ['true', '1', 'yes'].includes(value); assert.equal(requests - before, 1); }
    assert.deepEqual(device.state, previous, 'Power must preserve brightness and active gradient');
    console.log(`PASS: luxio on set ${value}`);
  }
  for (const entry of [
    { value: '1%', brightness: 3 },
    { value: '12.5%', brightness: 32 },
    { value: '80%', brightness: 205 },
    { value: '85%', brightness: 218 },
    { value: '100%', brightness: 256 },
    ...['0%', '0.5%', '100.1%', '101%', '85', '85%%', '85foo%', 'NaN%', 'Infinity%', '1e2%'].map(value => ({ value, brightness: undefined })),
  ]) {
    device.state.on = entry.value === '85%';
    const before = requests, previousBrightness = device.state.brightness, previousPower = device.state.on, previousMode = device.state.mode;
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, 'brightness', 'set', entry.value]);
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    if (entry.brightness === undefined) {
      assert.equal(code, 1); assert.match(stderr, /1%–100%/);
      assert.equal(requests, before, 'Invalid percentages must not contact the device');
      assert.equal(device.state.brightness, previousBrightness);
    } else {
      assert.equal(code, 0, stderr); assert.equal(JSON.parse(stdout).state.brightness, entry.brightness);
      assert.equal(device.state.brightness, entry.brightness);
      assert.equal(requests - before, 1);
    }
    assert.equal(device.state.on, previousPower); assert.equal(device.state.mode, previousMode);
    console.log(`PASS: luxio brightness set ${entry.value}`);
  }
  const before = requests;
  const child = spawn(process.execPath, ['dist/index.js', '--device', target, 'animations']);
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0, stderr);
  const listed = JSON.parse(stdout).animations;
  assert.equal(listed.length, 150); assert.equal(new Set(listed.map((script: { id: string }) => script.id)).size, 150);
  assert.equal(requests - before, 3);
  console.log('PASS: CLI lists all 150 saved items across three pages');
  await mkdir('.sdk', { recursive: true });
  await writeFile('.sdk/ram-test.lua', 'function setup() end function loop() luxio_set_pixel_color(0,0,255,0) end');
  let colorId = '', savedGradientId = '';
  for (const args of [
    ['set-animation', '.sdk/ram-test.lua'], ['save-color', 'Red', 'ff0000'], ['save-gradient', 'Sea', '0011ff,00ff80'], ['colors'], ['gradients'],
    ['get-color', 'COLOR'], ['get-gradient', 'GRADIENT'], ['run-color', 'COLOR'], ['run-gradient', 'GRADIENT'],
    ['save-color', 'Renamed', '00ff00', '--id', 'COLOR'], ['save-gradient', 'Renamed', 'ff0000,0000ff', '--id', 'GRADIENT'],
    ['set-color', '000000'], ['delete-color', 'COLOR'], ['delete-gradient', 'GRADIENT']
  ]) {
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...args.map(a => a === 'COLOR' ? colorId : a === 'GRADIENT' ? savedGradientId : a)]);
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 0, stderr); const result = JSON.parse(stdout);
    if (args[0] === 'save-color') colorId = result.savedColor.id;
    if (args[0] === 'save-gradient') savedGradientId = result.gradient.id;
  }
  assert.equal(device.colors.length, 0); assert.equal(device.gradients.length, 0); assert.equal(device.scripts.length, 150);
  console.log('PASS: independent color and gradient CRUD through CLI');
  let animationId = '';
  for (const args of [
    ['save-animation', '.sdk/ram-test.lua', '--name', 'Rainbow'],
    ['save-animation', '.sdk/ram-test.lua', '--name', 'Renamed', '--id', 'ANIMATION'],
    ['get-animation', 'ANIMATION'], ['run-animation', 'ANIMATION'], ['set-color', '000000'], ['delete-animation', 'ANIMATION'],
    ['get-animation', 'ANIMATION'], ['--help'],
  ]) {
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...args.map(a => a === 'ANIMATION' ? animationId : a)]);
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    if (args[0] === 'get-animation' && device.scripts.length === 150) {
      assert.equal(code, 1); assert.match(stderr, /Animation not found/); continue;
    }
    assert.equal(code, 0, stderr);
    if (args[0] === '--help') {
      for (const command of ['brightness', 'on', 'config', 'wifi', 'matter', 'state', 'update', 'animation-set-parameters', 'set-animation', 'save-animation', 'animations', 'get-animation', 'run-animation', 'delete-animation']) assert.ok(stdout.includes(command));
      assert.doesNotMatch(stdout, /script/i); continue;
    }
    if (args[0] === 'get-animation') { assert.match(stdout, /function loop/); continue; }
    const result = JSON.parse(stdout);
    assert.equal(result.scripts, undefined); assert.equal(result.script, undefined);
    if (result.state) { assert.equal(result.state.activeScriptId, undefined); assert.ok('activeAnimationId' in result.state); }
    if (args[0] === 'save-animation') { if (animationId) assert.equal(result.animation.id, animationId); animationId = result.animation.id; }
    if (args[0] === 'run-animation') assert.equal(result.state.activeAnimationId, animationId);
  }
  assert.equal(device.scripts.length, 150);
  console.log('PASS: animation command names, CRUD, help, JSON output, and errors');
  await writeFile('.sdk/parameter-test.lua', '-- @parameter Flicker,Checkbox,true\n-- @parameter Speed,Slider,50,0,100\n-- @parameter Spacing,Number,8,1,64\nfunction loop() luxio_set_pixel_color(0, luxio_get_parameter("Speed"), luxio_get_parameter("Flicker") and 255 or 0, 0) end');
  let parameterId = '';
  for (const args of [
    ['save-animation', '.sdk/parameter-test.lua', '--name', 'Parameters', '--parameters', '{"Speed":60}'],
    ['run-animation', 'PARAMETER'], ['animation-set-parameters', '{"Flicker":false,"Speed":80}'],
    ['animation-set-parameters', '{"Speed":90}', '--save'], ['delete-animation', 'PARAMETER'],
    ['set-animation', '.sdk/parameter-test.lua', '--parameters', '{"Speed":30}'],
    ['animation-set-parameters', '{"Speed":40}'], ['set-color', '000000']
  ]) {
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...args.map(a => a === 'PARAMETER' ? parameterId : a)]);
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 0, stderr); const result = JSON.parse(stdout);
    if (args[0] === 'save-animation') { parameterId = result.animation.id; assert.equal(result.animation.parameters[1].value, 60); }
    if (args[0] === 'animation-set-parameters') {
      const expected = JSON.parse(args[1]); assert.equal(result.state.parameters[1].value, expected.Speed);
      if (device.state.activeScriptId) assert.equal(device.scripts.find(s => s.id === parameterId)!.parameters![1].value, args.includes('--save') ? 90 : 60);
    }
  }
  assert.equal(device.scripts.length, 150);
  console.log('PASS: CLI parameter defaults, overrides, live edits, and explicit persistence');


  for (const entry of [
    { strip: 'WS2805', count: 1, args: ['set-gradient', 'ff0000,0000ff'], error: true },
    { strip: 'WS2805', count: 1, args: ['save-gradient', 'Sea', 'ff0000,0000ff'], error: true },
    { strip: 'WS2805', count: 1, args: ['run-gradient', 'unused'], error: true },
    { strip: 'WS2805', count: 2, args: ['set-gradient', 'ff0000,0000ff'], error: false },
    { strip: 'WS2814', count: 2, args: ['channels', '--warm-white', '255'], error: true },
    { strip: 'WS2814', count: 2, args: ['channels', '--cool-white', '255'], error: true },
    { strip: 'WS2814', count: 2, args: ['channels', '--white', '255'], error: false },
    { strip: 'WS2805', count: 2, args: ['channels', '--white', '255'], error: true },
    { strip: 'WS2805', count: 2, args: ['channels', '--warm-white', '100', '--cool-white', '155'], error: false },
    { strip: 'WS2812', count: 2, args: ['channels', '--white', '255'], error: true },
    { strip: 'WS2812', count: 2, args: ['channels', '--warm-white', '255'], error: true },
    { strip: 'WS2812', count: 2, args: ['channels', '--red', '255'], error: false },
  ]) {
    device.state.config.stripType = entry.strip as 'WS2805'; device.state.config.ledCount = entry.count;
    const before = requests;
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...entry.args]);
    let stderr = ''; child.stderr.on('data', data => stderr += data); child.stdout.resume();
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, entry.error ? 1 : 0, stderr);
    if (entry.error) { assert.match(stderr, /require/); assert.equal(requests - before, 1, 'Only read configuration; do not send an unsupported command'); }
  }
  console.log('PASS: one/two LED boundary and RGB/RGBW/RGBCCT channel restrictions');


  for (const entry of [
    { args: ['state', 'get'], expected: undefined },
    { args: ['brightness', 'get'], expected: '100%\n' },
    { args: ['on', 'get'], expected: 'true\n' },
    { args: ['config', 'get'], expected: undefined },
    { args: ['wifi', 'get'], expected: undefined },
    { args: ['matter', 'get-pair-code'], expected: undefined },
    { args: ['update', 'get'], expected: undefined },
    { args: ['update', 'install'], expected: undefined },
  ]) {
    const before = requests, previous = structuredClone(device.state);
    const child = spawn(process.execPath, ['dist/index.js', ...entry.args, '--device', target]);
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 0, stderr); assert.equal(requests - before, 1);
    assert.deepEqual(device.state, previous);
    if (entry.expected) assert.equal(stdout, entry.expected);
    else if (entry.args[0] === 'state') assert.equal(JSON.parse(stdout).state.deviceId, 'cli-test');
    else if (entry.args[0] === 'config') assert.deepEqual(JSON.parse(stdout), device.state.config);
    else if (entry.args[0] === 'wifi') { const result = JSON.parse(stdout); assert.equal(result.ssid, 'Test network'); assert.equal(result.lanIp, '127.0.0.1'); assert.equal(result.password, undefined); }
    else if (entry.args[0] === 'matter') { assert.equal(requestLog.at(-1)!.operation, 12); assert.equal(JSON.parse(stdout).pairingCode, '12345678901'); }
    else if (entry.args[1] === 'get') { assert.equal(requestLog.at(-1)!.operation, 13); assert.equal(JSON.parse(stdout).availableBuild, 22); }
    else { assert.equal(requestLog.at(-1)!.operation, 14); assert.match(stdout, /Update requested/); }
  }
  console.log('PASS: state, brightness, power, configuration, Wi-Fi, Matter and update namespaces');

  for (const entry of [
    { path: ['name'], key: 'name', value: 'Kitchen light', parsed: 'Kitchen light' },
    { path: ['type'], key: 'stripType', value: 'WS2805', parsed: 'WS2805' },
    { path: ['led-count'], key: 'ledCount', value: '60', parsed: 60 },
    { path: ['gpio'], key: 'gpio', value: '5', parsed: 5 },
    { path: ['channel'], key: 'channel', value: '75', parsed: 75 },
    { path: ['relay', 'gpio'], key: 'relay', value: '12', parsed: 12 },
    { path: ['relay', 'inverted'], key: 'relay', value: 'yes', parsed: true },
    { path: ['relay', 'enabled'], key: 'relay', value: '1', parsed: true },
    { path: ['wifi', 'enabled'], key: 'wifi', value: 'no', parsed: false },
    { path: ['matter', 'enabled'], key: 'matter', value: '0', parsed: false },
  ]) {
    const before = requests;
    const expected = structuredClone(device.state.config) as Record<string, any>;
    if (entry.path.length === 2) expected[entry.key] = { ...(expected[entry.key] ?? { enabled: false, gpio: 0, inverted: false }), [entry.path[1]]: entry.parsed };
    else expected[entry.key] = entry.parsed;
    for (const action of ['set', 'get']) {
      const child = spawn(process.execPath, ['dist/index.js', '--device', target, 'config', ...entry.path, action, ...(action === 'set' ? [entry.value] : [])]);
      let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
      const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
      assert.equal(code, 0, stderr);
      if (action === 'get') assert.equal(stdout.trim(), String(entry.parsed));
      assert.deepEqual(device.state.config, expected, 'Field setters must preserve all unrelated configuration');
    }
    assert.equal(requests - before, 3);
  }
  console.log('PASS: configuration field get/set and preservation of sibling fields');

  await writeFile('.sdk/wifi-test.json', JSON.stringify({ ssid: 'Test network', password: 'test-password' }));
  await writeFile('.sdk/wifi-invalid.json', 'null');
  for (const file of ['.sdk/wifi-test.json', '.sdk/wifi-invalid.json']) {
    const before = requests;
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, 'wifi', 'set', file]);
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    if (file.includes('invalid')) { assert.equal(code, 1); assert.match(stderr, /Expected ssid and password/); assert.equal(requests, before); }
    else { assert.equal(code, 0, stderr); assert.equal(requests - before, 1); assert.equal(requestLog.at(-1)!.operation, 4); assert.deepEqual(requestLog.at(-1)!.wifi, { ssid: 'Test network', password: 'test-password' }); }
    assert.doesNotMatch(stdout + stderr, /test-password/);
  }
  console.log('PASS: Wi-Fi file input and credential-free output');

  for (const args of [
    ['stop'], ['off'], ['set-brightness', '80%'], ['brightness', '128'], ['on'], ['state'], ['update'],
    ['pairing'], ['check-update'], ['set-parameters', '{}'], ['wifi', '.sdk/wifi-test.json'], ['config', '{}'],
    ['config', 'led-count', 'set', '0'], ['config', 'gpio', 'set', '62'], ['config', 'channel', 'set', 'abc'],
    ['config', 'name', 'set', ''], ['config', 'relay', 'enabled', 'set', 'invalid'], ['config', 'relay', 'gpio', 'set', '62'],
  ]) {
    const before = requests;
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...args]);
    let stderr = ''; child.stderr.on('data', data => stderr += data); child.stdout.resume();
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 1, args.join(' ') + ': ' + stderr); assert.equal(requests, before, 'Removed commands and invalid values must not contact the device');
  }
  console.log('PASS: removed commands and invalid configuration rejected before device access');

} finally { server.close(); device.animation?.close(); }
