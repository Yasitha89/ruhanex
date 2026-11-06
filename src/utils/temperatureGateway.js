export function buildTemperatureControllers(gatewayId, slaves) {
  if (!Array.isArray(slaves) || !slaves.length || slaves.length > 6) throw new Error('Configure between 1 and 6 temperature controllers.');
  const addresses = new Set(), slots = new Set(), identifiers = new Set();
  return slaves.map((slave, index) => {
    const slaveId = Number(slave?.slaveId), controllerSlot = Number(slave?.controllerSlot ?? index + 1);
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 247) throw new Error('Modbus slave IDs must be whole numbers from 1 to 247.');
    if (!Number.isInteger(controllerSlot) || controllerSlot < 1 || controllerSlot > 6) throw new Error('Controller slots must be whole numbers from 1 to 6.');
    if (addresses.has(slaveId) || slots.has(controllerSlot)) throw new Error('Each controller needs a unique slave ID and controller slot.');
    addresses.add(slaveId); slots.add(controllerSlot);
    const deviceLabel = String(slave.deviceLabel || '').trim();
    if (!deviceLabel || deviceLabel.length > 100) throw new Error('Enter a controller label of at most 100 characters.');
    const controllerId = String(slave.controllerId || `${gatewayId}-T${String(controllerSlot).padStart(2, '0')}`).trim();
    if (controllerId.length > 100 || identifiers.has(controllerId)) throw new Error('Controller IDs must be unique and at most 100 characters.');
    identifiers.add(controllerId);
    return { controllerId, controllerSlot, slaveId, enabled: slave.enabled !== false, deviceLabel };
  });
}
