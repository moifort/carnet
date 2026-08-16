/**
 * In-memory Firestore fake for unit tests. Records every created batch and every
 * direct (non-batched) write so tests can assert the atomicity contract: all
 * writes of an operation enlisted into one batch, committed exactly once, and
 * nothing applied when the commit fails.
 *
 * Test files mock the firebase module with the shared holder so file ordering
 * does not matter:
 *   mock.module('~/system/firebase', fakeFirebase)
 *
 * Always the whole `fakeFirebase` factory, never a hand-rolled `{ db: fakeDb }`:
 * `mock.module` REPLACES a module wholesale and is global to the test process, so a
 * partial factory silently strips the exports it omits — for every test file, not
 * just its own. That is how five tests that only needed `db` broke a use case that
 * needed `auth`, and only on CI, where the file ordering differed.
 */
import type { Firestore } from 'firebase-admin/firestore'

type Doc = Record<string, unknown>

export type FakeSnapshot = { exists: boolean; id: string; data: () => Doc | undefined }

export type FakeRef = {
  collection: string
  id: string
  get: () => Promise<FakeSnapshot>
  set: (data: Doc) => Promise<void>
  delete: () => Promise<void>
}

export type BatchOp = { type: 'set'; ref: FakeRef; data: Doc } | { type: 'delete'; ref: FakeRef }

export type FakeBatch = {
  ops: BatchOp[]
  commits: number
  set: (ref: FakeRef, data: Doc) => FakeBatch
  delete: (ref: FakeRef) => FakeBatch
  commit: () => Promise<void>
}

export type DirectWrite = { type: 'set' | 'delete'; collection: string; id: string }

export type FakeTransaction = {
  get: (ref: FakeRef) => Promise<FakeSnapshot>
  set: (ref: FakeRef, data: Doc) => FakeTransaction
  delete: (ref: FakeRef) => FakeTransaction
}

type FakeQuery = {
  where: (field: string, op: string, value: unknown) => FakeQuery
  orderBy: (field: string, direction?: 'asc' | 'desc') => FakeQuery
  limit: (count: number) => FakeQuery
  offset: (count: number) => FakeQuery
  startAfter: (cursor: FakeSnapshot) => FakeQuery
  get: () => Promise<{ docs: Array<{ data: () => Doc; ref: FakeRef }> }>
  count: () => { get: () => Promise<{ data: () => { count: number } }> }
}

type FakeCollection = {
  withConverter: (converter: unknown) => FakeCollection
  doc: (id?: string) => FakeRef
  add: (data: Doc) => Promise<FakeRef>
  where: FakeQuery['where']
  orderBy: FakeQuery['orderBy']
  limit: FakeQuery['limit']
  get: FakeQuery['get']
}

export const createFakeFirestore = () => {
  const store = new Map<string, Map<string, Doc>>()
  const batches: FakeBatch[] = []
  const directWrites: DirectWrite[] = []
  // The writes each committed transaction applied, in order.
  const transactions: BatchOp[][] = []
  let commitError: Error | undefined
  let generatedIds = 0
  let docReads = 0
  let queryReads = 0

  const docsOf = (collection: string) => {
    const existing = store.get(collection)
    if (existing) return existing
    const created = new Map<string, Doc>()
    store.set(collection, created)
    return created
  }

  const makeRef = (collection: string, id: string): FakeRef => ({
    collection,
    id,
    get: async () => {
      docReads += 1
      const doc = docsOf(collection).get(id)
      return { exists: doc !== undefined, id, data: () => doc }
    },
    set: async (data) => {
      directWrites.push({ type: 'set', collection, id })
      docsOf(collection).set(id, data)
    },
    delete: async () => {
      directWrites.push({ type: 'delete', collection, id })
      docsOf(collection).delete(id)
    },
  })

  const sortValue = (value: unknown) =>
    value instanceof Date ? value.getTime() : (value as number | string)

  type Filter = [field: string, op: string, value: unknown]
  type Order = { field: string; direction: 'asc' | 'desc' }
  type QueryState = {
    filters: Filter[]
    // Chained orderBy calls, applied in sequence (primary, secondary, …) like
    // real Firestore composite ordering — the document id breaks final ties.
    orders: Order[]
    limit?: number
    offset?: number
    startAfterId?: string
  }

  // Only the operators production code actually uses — fail loudly otherwise.
  const matchesFilter = (data: Doc, [field, op, value]: Filter) => {
    if (op === '==') return data[field] === value
    if (op === '!=') return data[field] !== undefined && data[field] !== value
    if (op === 'in') return Array.isArray(value) && value.includes(data[field])
    throw new Error(`fake-firestore only supports '==', '!=' and 'in' queries, got '${op}'`)
  }

  const makeQuery = (collection: string, state: QueryState): FakeQuery => ({
    where: (field, op, value) =>
      makeQuery(collection, { ...state, filters: [...state.filters, [field, op, value]] }),
    orderBy: (field, direction = 'asc') =>
      makeQuery(collection, { ...state, orders: [...state.orders, { field, direction }] }),
    limit: (count) => makeQuery(collection, { ...state, limit: count }),
    offset: (count) => makeQuery(collection, { ...state, offset: count }),
    startAfter: ({ id }) => makeQuery(collection, { ...state, startAfterId: id }),
    get: async () => {
      queryReads += 1
      let matching = [...docsOf(collection).entries()].filter(([, data]) =>
        state.filters.every((filter) => matchesFilter(data, filter)),
      )
      if (state.orders.length > 0) {
        // Firestore appends an implicit __name__ tie-break in the direction of the
        // LAST orderBy — mirror it so equal-key rows page deterministically.
        const lastDir = state.orders[state.orders.length - 1]?.direction ?? 'asc'
        matching.sort(([idA, a], [idB, b]) => {
          for (const { field, direction } of state.orders) {
            const left = sortValue(a[field])
            const right = sortValue(b[field])
            const primary = left < right ? -1 : left > right ? 1 : 0
            if (primary !== 0) return direction === 'desc' ? -primary : primary
          }
          const tie = idA < idB ? -1 : idA > idB ? 1 : 0
          return lastDir === 'desc' ? -tie : tie
        })
      }
      if (state.startAfterId) {
        const cursorIndex = matching.findIndex(([id]) => id === state.startAfterId)
        if (cursorIndex >= 0) matching = matching.slice(cursorIndex + 1)
      }
      if (state.offset !== undefined) matching = matching.slice(state.offset)
      if (state.limit !== undefined) matching = matching.slice(0, state.limit)
      return {
        docs: matching.map(([id, data]) => ({ data: () => data, ref: makeRef(collection, id) })),
      }
    },
    // Aggregation count: like Firestore, one billed query round-trip, no documents.
    count: () => ({
      get: async () => {
        queryReads += 1
        const matching = [...docsOf(collection).values()].filter((data) =>
          state.filters.every((filter) => matchesFilter(data, filter)),
        )
        return { data: () => ({ count: matching.length }) }
      },
    }),
  })

  const makeCollection = (name: string): FakeCollection => ({
    withConverter: () => makeCollection(name),
    doc: (id) => makeRef(name, id ?? `generated-${++generatedIds}`),
    add: async (data) => {
      const ref = makeRef(name, `generated-${++generatedIds}`)
      await ref.set(data)
      return ref
    },
    where: (field, op, value) => makeQuery(name, { filters: [[field, op, value]], orders: [] }),
    orderBy: (field, direction) =>
      makeQuery(name, { filters: [], orders: [] }).orderBy(field, direction),
    limit: (count) => makeQuery(name, { filters: [], orders: [] }).limit(count),
    get: () => makeQuery(name, { filters: [], orders: [] }).get(),
  })

  const makeBatch = (): FakeBatch => {
    const ops: BatchOp[] = []
    const batch: FakeBatch = {
      ops,
      commits: 0,
      set: (ref, data) => {
        ops.push({ type: 'set', ref, data })
        return batch
      },
      delete: (ref) => {
        ops.push({ type: 'delete', ref })
        return batch
      },
      commit: async () => {
        if (commitError) throw commitError
        for (const op of ops) {
          if (op.type === 'set') docsOf(op.ref.collection).set(op.ref.id, op.data)
          else docsOf(op.ref.collection).delete(op.ref.id)
        }
        batch.commits += 1
      },
    }
    batches.push(batch)
    return batch
  }

  // Transactions run one at a time, which is the property under test: a
  // read-modify-write must not interleave with another. Real Firestore reaches it
  // by replaying a losing transaction; serializing is the same guarantee, and it
  // makes a concurrency test deterministic instead of retry-dependent.
  let transactionQueue: Promise<unknown> = Promise.resolve()

  const runTransaction = <T>(run: (tx: FakeTransaction) => Promise<T>): Promise<T> => {
    const result = transactionQueue.then(async () => {
      const writes: BatchOp[] = []
      const tx: FakeTransaction = {
        get: async (ref) => {
          docReads += 1
          const doc = docsOf(ref.collection).get(ref.id)
          return { exists: doc !== undefined, id: ref.id, data: () => doc }
        },
        set: (ref, data) => {
          writes.push({ type: 'set', ref, data })
          return tx
        },
        delete: (ref) => {
          writes.push({ type: 'delete', ref })
          return tx
        },
      }
      const value = await run(tx)
      // Applied only once the body succeeded — a throw leaves the store untouched.
      for (const op of writes) {
        if (op.type === 'set') docsOf(op.ref.collection).set(op.ref.id, op.data)
        else docsOf(op.ref.collection).delete(op.ref.id)
      }
      transactions.push(writes)
      return value
    })
    // The queue must keep flowing even when a transaction throws, or every later
    // one would inherit the rejection.
    transactionQueue = result.catch(() => undefined)
    return result
  }

  const getAll = async (...refs: FakeRef[]) => {
    docReads += refs.length
    return refs.map((ref) => {
      const doc = docsOf(ref.collection).get(ref.id)
      return { exists: doc !== undefined, id: ref.id, data: () => doc }
    })
  }

  return {
    db: {
      collection: makeCollection,
      batch: makeBatch,
      getAll,
      runTransaction,
    } as unknown as Firestore,
    seed: (collection: string, id: string, data: Doc) => {
      docsOf(collection).set(id, { ...data })
    },
    snapshot: (collection: string) => new Map(docsOf(collection)),
    batches,
    directWrites,
    transactions,
    // Firestore round-trips (document gets + query gets) — lets tests assert read budgets
    get reads() {
      return docReads + queryReads
    },
    // Keyed document gets only (ref.get + getAll) — one read per document fetched
    get docReads() {
      return docReads
    },
    // Collection query gets only — a scan counts 1 whatever the number of docs returned,
    // so asserting queryReads === 0 is the proof that a path never scans a collection
    get queryReads() {
      return queryReads
    },
    failCommitsWith: (error: Error) => {
      commitError = error
    },
  }
}

export type FakeFirestore = ReturnType<typeof createFakeFirestore>

const holder = { current: createFakeFirestore() }

/// Accounts deleted through the fake auth, in order, so a test can assert both that
/// the deletion happened and that it happened after the data went.
export const deletedUsers: string[] = []

export const resetFakeFirestore = () => {
  holder.current = createFakeFirestore()
  deletedUsers.length = 0
  // Give each test a fresh, stable request context so memoizedPerRequest() caches
  // within the test (mirroring one HTTP request) and is cleared between tests.
  const context: Record<string, unknown> = {}
  ;(globalThis as unknown as { useEvent: () => unknown }).useEvent = () => ({ context })
  return holder.current
}

export const fakeDb = () => holder.current.db

export const fakeAuth = () => ({
  deleteUser: async (uid: string) => {
    deletedUsers.push(uid)
  },
})

/// The whole `~/system/firebase` module, faked. Pass this factory itself to
/// `mock.module` — see the note at the top of this file.
export const fakeFirebase = () => ({ db: fakeDb, auth: fakeAuth })
