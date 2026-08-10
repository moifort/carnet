// Does this oven let a favourite be selected remotely? The appliance reports a
// `favoriteSelect` field but never declares it among the writable capabilities,
// and its assisted programmes are refused through `program` — so this asks the
// only question left, by hand, with the cook standing in front of an empty oven.
//
// It NEVER sends `executeCommand`: at worst it selects, it cannot start a cooking.
// Usage: bun scripts/oven-favorite-probe.ts [index…]   (defaults to 0 and 1)
import { CAVITY, openSession } from './electrolux-session'

const indexes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['0', '1']
const session = await openSession()

const cavityState = async () => {
  const state = (await session.get(`/appliances/${session.ovenId}/state`)) as {
    properties?: { reported?: Record<string, Record<string, unknown>> }
  }
  return state.properties?.reported?.[CAVITY] ?? {}
}

const before = await cavityState()
process.stdout.write(
  `before: program=${String(before.program)} favoriteSelect=${String(before.favoriteSelect)}\n\n`,
)

for (const index of indexes) {
  const answer = await session.command({ [CAVITY]: { favoriteSelect: index } })
  process.stdout.write(`favoriteSelect="${index}" -> ${answer.status} ${answer.body}\n`)
  if (answer.status < 300) {
    const after = await cavityState()
    process.stdout.write(
      `  now: program=${String(after.program)} favoriteSelect=${String(after.favoriteSelect)}\n`,
    )
  }
}

// The other half of the question: `favorite` IS declared writable, so can a
// favourite be written carrying an assisted programme? Its `program` field
// references the same enumeration, so this is expected to fail — expected is not
// established, and the answer closes the trail either way.
const assisted = 'ASSIST_QUICHEANDTARTETHIN'
const written = await session.command({
  [CAVITY]: { favorite: [{ haconListItemId: 1, program: assisted }] },
})
process.stdout.write(`\nfavorite[program=${assisted}] -> ${written.status} ${written.body}\n`)
