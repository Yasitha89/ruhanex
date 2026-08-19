# Energy unit correction

The Energy Overview now treats `energyUsageKwh` returned by Node-RED as the primary
interval-consumption value.

`firstEnergyKwh` and `lastEnergyKwh` are used only as a fallback when both values
are actually present and numeric. `null`, `undefined`, and empty strings are not
converted to zero.

Display conversion remains:

- below 1,000 kWh: kWh
- 1,000 to below 1,000,000 kWh: MWh
- 1,000,000 kWh and above: GWh

The total, mini-chart bars, and tooltip all use the same unit for each card.
