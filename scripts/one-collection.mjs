// One collection per source (the app adds one per Erscheinungsform by itself). The source's own groupings
// (practice plan, lesson, category, age) are kept as a «Gruppen: …» line in each drill's description.
export function oneCollection(drills, groups, id, name) {
  const of = new Map()
  for (const g of groups) if (!g.name.endsWith('(alle)')) for (const d of g.drillIds) of.set(d, [...(of.get(d) ?? []), g.name.replace(/^[^:]+: /, '')])
  for (const d of drills) if (of.has(d.id)) d.description += `\n\nGruppen: ${[...new Set(of.get(d.id))].join('; ')}`
  return [{ id, name, drillIds: drills.map((d) => d.id) }]
}

// Self-check: node scripts/one-collection.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const drills = [{ id: 'a', description: 'Text' }, { id: 'b', description: 'Text' }]
  const out = oneCollection(drills, [{ name: 'X (alle)', drillIds: ['a', 'b'] }, { name: 'X: Plan 1', drillIds: ['a'] }, { name: 'X: Skating', drillIds: ['a'] }], 'x-c-all', 'X')
  console.assert(JSON.stringify(out) === '[{"id":"x-c-all","name":"X","drillIds":["a","b"]}]', out)
  console.assert(drills[0].description === 'Text\n\nGruppen: Plan 1; Skating' && drills[1].description === 'Text', drills)
  console.log('ok')
}
