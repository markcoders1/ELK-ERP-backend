# Calculations (server)

Isolated Component BOM calculation engine.

## Files

- `calculation.service.js` — section dispatch + component rollup + role-aware stripping
- `registry.js` — open `sectionType → calculator` map
- `plugins/board.plugin.js`
- `plugins/hardware.plugin.js` — live Hardware Master costs only
- `plugins/factory.plugin.js`
- `plugins/variant.plugin.js` — finish pricing; does not roll into manufacturing total

## Rollup

```
sectionCosts (BOARD + HARDWARE + FACTORY + future cost-bearing types)
  = totalCost
margin = retail − totalCost
margin% = margin / retail
```

Future section types (DOORS, PANELS, PACKAGING, …) register a plugin — no schema change.
