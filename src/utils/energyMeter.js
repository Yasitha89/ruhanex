export function getEnergyDeviceLabel(record = {}) {
  const label =
    record.device_label ??
    record.deviceLabel ??
    record.device_name ??
    record.deviceName ??
    record.meter_label ??
    record.meterLabel ??
    record.label;

  const normalized = String(label ?? "").trim();
  if (normalized) return normalized;

  const deviceId = record.device_id ?? record.deviceId;
  return deviceId === null || deviceId === undefined || deviceId === ""
    ? "Unknown device"
    : `Device ${deviceId}`;
}

export function getEnergyMeterKey(record = {}) {
  const panel = String(record.panel ?? "").trim() || "__no_panel__";
  const deviceId = record.device_id ?? record.deviceId;
  const normalizedDeviceId =
    deviceId === null || deviceId === undefined || deviceId === ""
      ? "__unknown_device__"
      : String(deviceId);

  // device_id is only unique inside a panel. Keeping panel in the key prevents
  // collisions when the UI later allows meters from multiple panels at once.
  return `${panel}::${normalizedDeviceId}`;
}

export function getEnergyMeters(data = []) {
  const meters = new Map();

  for (const record of data || []) {
    const key = getEnergyMeterKey(record);
    if (meters.has(key)) continue;

    meters.set(key, {
      key,
      panel: record?.panel ?? "",
      deviceId:
        record?.device_id === null || record?.device_id === undefined
          ? ""
          : String(record.device_id),
      label: getEnergyDeviceLabel(record),
    });
  }

  return Array.from(meters.values()).sort((a, b) => {
    const panelCompare = String(a.panel).localeCompare(String(b.panel));
    if (panelCompare !== 0) return panelCompare;

    const aNumber = Number(a.deviceId);
    const bNumber = Number(b.deviceId);
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber;
    }

    return String(a.deviceId).localeCompare(String(b.deviceId));
  });
}
