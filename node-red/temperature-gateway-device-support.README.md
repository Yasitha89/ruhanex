# Temperature Gateway device configuration

The frontend **Settings → Admin → Device Administration → Add Device** now includes **Temperature Gateway** (`temperature_gateway`).

- Short ID `3000` generates gateway ID `RX-TEMP-3000`.
- Configure location, gateway label and gateway enabled state.
- Add 1–6 Modbus temperature controllers, each with slave ID 1–247, slot 1–6, label, enabled state and optional controller ID.
- Slave IDs and slots must be unique within the gateway. Controller IDs are generated as `RX-TEMP-3000-T01`, etc., when omitted.

## Backend patch required

Your existing device API only accepts RX-CNT and RX-ENM keys. Import `temperature-gateway-device-support.patch.flow.json` and replace the matching **seven Function nodes** while retaining the existing device API wiring:

- `fn_post_device` and `fn_put_device`: validate the new prefix and temperature controller configuration.
- `fn_post_response`, `fn_put_response`, `fn_delete_response`: update the shared registry and temperature cache on successful saves/deletion.
- `c69ec7943d734c03` (Devices → Global Context) and `88737009f81f9070` (Energy Config → Global Context): load the temperature cache at startup/registry refresh.

If imported copies are created instead, copy each replacement's Function code into the existing matching node and remove the unused copies. Deploy. No additional HTTP endpoint or database collection is needed. The gateway is saved under `ruhanex_config` document `_id: devices`, in `devices.RX-TEMP-3000`, matching the existing registry architecture.

The supplied temperature ingestion flow already reads `global.devices['RX-TEMP-3000'].slaves`, matching by `slaveId`. It uses `deviceLabel` for new samples and the controller/gateway `enabled` flags to ignore disabled readings. The patch also maintains `global.temperatureGatewayConfig` as its fallback. Energy and counter caches remain separate.

**This configures server-side registration, labels and enablement.** It does not remotely change Modbus addresses, firmware controller slots, register maps or scaling. Enter the same slave IDs/slots configured in the gateway firmware. PV/SV values are already scaled by the firmware; no additional scale factor is applied here.

Your attached temperature MQTT/API flow is hard-coded to `RX-TEMP-3000` and `RX-TEMP/3000/...`. Registering another gateway ID does not automatically make those subscriptions or queries handle it; those flows need a separate multi-gateway update if you add another gateway. Historical Influx records retain their original labels.

Run `node node-red/test-temperature-gateway-device-support.mjs` for offline checks. Live saving/telemetry needs verification after deploying the patch.
