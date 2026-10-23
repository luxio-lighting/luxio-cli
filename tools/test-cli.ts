import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { Device } from '../shared/device/src/device.js';
import { decodeRequest, encodeResponse } from '../shared/protocol/src/index.js';

const device = new Device('cli-test'); device.state.build = 21; device.state.brightness = 256;
let requests = 0;
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  requests++;
  response.setHeader('Content-Type', 'application/x-protobuf');
  response.end(encodeResponse(device.handle(decodeRequest(Buffer.concat(chunks)))));
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
  for (const args of [['off'], ['brightness', '1'], ['brightness', '256'], ['on'], ['brightness', '0'], ['brightness', '257']]) {
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...args]);
    let stderr = ''; child.stderr.on('data', data => { stderr += data; }); child.stdout.resume();
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    const invalid = args[1] === '0' || args[1] === '257';
    assert.equal(code, invalid ? 1 : 0, stderr);
    if (invalid) assert.match(stderr, /1–256/);
    else { assert.equal(device.state.on, args[0] === 'on'); assert.equal(device.state.brightness, args[1] === '1' ? 1 : 256); }
    console.log(`PASS: luxio ${args.join(' ')}`);
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
    ['stop'], ['delete-color', 'COLOR'], ['delete-gradient', 'GRADIENT']
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
    ['get-animation', 'ANIMATION'], ['run-animation', 'ANIMATION'], ['stop'], ['delete-animation', 'ANIMATION'],
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
      for (const command of ['set-animation', 'save-animation', 'animations', 'get-animation', 'run-animation', 'delete-animation']) assert.ok(stdout.includes(command));
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
    ['run-animation', 'PARAMETER'], ['set-parameters', '{"Flicker":false,"Speed":80}'],
    ['set-parameters', '{"Speed":90}', '--save'], ['delete-animation', 'PARAMETER'],
    ['set-animation', '.sdk/parameter-test.lua', '--parameters', '{"Speed":30}'],
    ['set-parameters', '{"Speed":40}'], ['stop']
  ]) {
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...args.map(a => a === 'PARAMETER' ? parameterId : a)]);
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 0, stderr); const result = JSON.parse(stdout);
    if (args[0] === 'save-animation') { parameterId = result.animation.id; assert.equal(result.animation.parameters[1].value, 60); }
    if (args[0] === 'set-parameters') {
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

} finally { server.close(); device.animation?.close(); }
