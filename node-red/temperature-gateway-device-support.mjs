import { buildTemperatureControllers } from '../src/utils/temperatureGateway.js';

export function validateTemperatureDevice(msg, buildControllers) {
  const body = msg.payload || {};
  const key = String(msg.req?.params?.key || body.key || '').trim();
  if (body.deviceType !== 'temperature_gateway' && !key.startsWith('RX-TEMP-')) return null;
  const fail = error => { msg.statusCode = 400; msg.headers = { 'Content-Type': 'application/json' }; msg.payload = { success: false, error }; return [null, msg]; };
  if (body.deviceType !== 'temperature_gateway' || !/^RX-TEMP-\d+$/.test(key)) return fail('Temperature gateway IDs must use RX-TEMP followed by the numeric short ID.');
  if (body.shortId != null && String(body.shortId).trim() !== key.slice('RX-TEMP-'.length)) return fail('Gateway short ID must match the device key.');
  try { body.slaves = buildControllers(key, body.slaves); }
  catch (error) { return fail(error.message); }
  return null;
}

export function syncTemperatureDevices(global) {
  const devices = global.get('devices') || {};
  const gateways = {};
  for (const [id, cfg] of Object.entries(devices)) {
    if (cfg?.deviceType === 'temperature_gateway' || id.startsWith('RX-TEMP-')) gateways[id] = cfg;
  }
  global.set('temperatureGatewayConfig', gateways);
  global.set('temperatureGatewayConfigReady', true);
}

export { buildTemperatureControllers };
