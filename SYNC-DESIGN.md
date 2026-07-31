# Food Log — Multi-Device Sync & Undo/Redo Design

Status: **draft for review**. This is a plan, not shipped code. It describes how
two installs of the app (say a phone and a laptop) reach the same state by
exchanging a small file, with no server and no account — and how undo/redo comes
out of the same machinery.

## 1. Goals and non-goals

The app has no backend by design; all data lives in each device's IndexedDB. Sync
therefore has to work by the user moving a **file** between devices — emailed to
themselves, AirDropped, or dropped in a shared cloud folder — and the app applying
it. The goals:

- Two devices that have both been edited independently converge to the **same
  state** after exchanging files, regardless of the order files are applied.
- The sync file is a **delta** ("changes since we last synced," or "since a date")
  — small, not a full re-export every time.
- **Deletes and edits** sync, not just additions.
- Applying the same file twice, or files out of order, never corrupts state
  (**idempotent** and **commutative**).
- **Undo/redo** works locally, built on the same foundation.
- A device can tell, cheaply, whether it is **in sync** with another (state
  hashes).

Non-goals for this round: real-time/automatic sync, a hosted relay, more than two
devices (the design allows N, but we'll test and ship for two), and field-level
merge of a single record (we use whole-record last-writer-wins; see §6).

## 2. What syncs, and what doesn't

Only user-authored data syncs: **log entries**, **custom foods/recipes**, and the
**synced settings** (currently just the net-carb budget). These are small and
personal.

Deliberately **not** synced: the `products` cache and the bundled seed (disposable,
regenerable from Open Food Facts / the seed file), the `pending` scan queue
(device-local and transient), and device-local settings such as `deviceId`,
`seedVersion`, and the per-peer sync markers. Today the `settings` store mixes
"real" settings (`carbTarget`) with device-local ones (`seedVersion`). **Step zero
is to split these** — namespace device-local keys (e.g. a `local:` prefix, or a
separate `localSettings` store) so sync never ships them.

## 3. The core model: a change journal

Every mutation the app makes becomes an immutable **operation** appended to a new
`journal` store. The live `entries` / `foods` / `settings` stores become a
**materialized view** — a fold over the journal — rather than the source of truth.

```
Op = {
  id:    uuid,                 // unique per op; dedupe key when merging
  hlc:   "<millis>.<counter>.<deviceId>",  // hybrid logical clock (see §8)
  dev:   deviceId,            // which device authored it
  store: "entries" | "foods" | "settings",
  key:   string,             // the record's STABLE id (see §5)
  type:  "put" | "del",
  value: {...} | null         // full record for put; null for del (tombstone)
}
```

An op is a whole-record assignment (`put`) or a tombstone (`del`). We do not diff
fields; a `put` carries the complete record. This keeps the model tiny and its
merge behavior provable.

**Materialization.** The current value of a record is the `value` of the op with
the highest `hlc` for that `key`; if that op is a `del`, the record is absent. In
CRDT terms each key is a **last-writer-wins register** and each store is an
**LWW-element-set**. Two consequences we rely on everywhere:

- **Idempotent:** applying an op you already have (same `id`) changes nothing.
- **Commutative/associative:** merging journals = set-union of ops by `id`, then
  re-fold. Order of files, duplicates, and partial overlaps all wash out. Two
  devices that have seen the same set of ops compute byte-identical state.

This single property is what lets us sync by mailing files around with no
coordinator.

The live stores are kept as a **cache of the fold** so the rest of the app (which
reads `entries`/`foods`/`settings`) needs almost no changes: a thin `applyOp()`
layer appends to the journal and updates the materialized record in the same
transaction. Reads stay as they are.

## 4. Record identity (the prerequisite)

Sync keys must mean the same thing on every device. Today:

- **entries** use an auto-increment integer `id` — device-local and **not
  portable** (id 42 is a different meal on each phone). Fix: add a `uid` (UUID)
  stamped at creation; sync on `uid`. Keep the numeric `id` only as the local
  IndexedDB key. One-time migration backfills `uid` for existing rows.
- **foods** already use string ids like `food:name:timestamp`. Good enough, but new
  foods should get a UUID suffix to remove any cross-device collision risk;
  existing ids are kept.
- **settings** are keyed by name — already global.

This migration ships first (Phase 0) and is invisible to the user.

## 5. State identity: hashes and version vectors

Two complementary mechanisms:

**Version vector — "what do I have?"** Each device keeps, per author device, the
highest `hlc` it has applied: `{ devA: hlcA, devB: hlcB, ... }`. This is the compact
summary of everything a device knows. To build a delta for a peer, you send the ops
whose `(dev, hlc)` the peer's vector doesn't already cover. Because each sync file
**includes the sender's version vector**, the receiver can immediately compute the
**return delta** — the ops *it* has that the sender lacked. So a full two-way
reconciliation is at most **two files** (A→B, then B→A), and often one is enough.

**State hash — "are we the same?"** A hash over the sorted set of op `id`s present
(a Merkle root if we want cheap partial comparison later). Each file carries the
sender's state hash; if two devices show the same hash they are provably in sync,
which the Settings screen can display at a glance. Hashes are for *verification and
display*; the version vector is what actually drives *what to send*.

"Since a given date" is just a filter on `hlc` time instead of on the peer's vector
— useful for a one-way "email me everything since July 1" without knowing the other
device's state.

## 6. Conflict resolution

Whole-record LWW by `hlc`. If the same record was changed on both devices since the
last sync, the op with the higher `hlc` wins the **whole record**; the other
version is discarded. For a personal food diary this is the right trade: conflicts
are rare (you usually log on whichever device is in hand), the rule is predictable,
and it's trivial to explain ("most recent edit wins").

Two cases worth stating plainly, because LWW makes them deterministic but lossy:

- **Edit vs edit** of one entry → the later edit's full record wins; the earlier
  edit's changes to other fields are lost.
- **Delete vs edit** of one record → higher `hlc` wins; a delete can beat an edit
  (record stays gone) or an edit can beat a delete (record resurrects).

The import summary will **report** these ("3 records where this device's copy was
replaced by a newer edit"), so nothing is silently surprising. Field-level merge
(CRDT per field) is a possible future upgrade; it isn't worth the complexity now.

## 7. Undo / redo

Because every change is already an op, undo is not special-cased — it's just
**another op** that restores the previous materialized value, appended with a fresh
(higher) `hlc`:

- Undo a **create** → append a `del` for that key.
- Undo a **delete** → append a `put` of the record's prior value.
- Undo an **edit** → append a `put` of the prior value.

The prior value is captured by `applyOp()` at write time and pushed onto an in-memory
**undo stack** (with its inverse). Redo re-applies the original. Because undo/redo
emit ordinary ops, they **also sync** — an undo on the laptop propagates like any
other change. This is the payoff of choosing the journal model.

Cross-device caveat, handled simply: the undo/redo stacks track the **local
session's** actions only. When a sync merge applies remote ops that touch a record
sitting in the undo stack, we invalidate the affected stack entries (and clear
redo) so undo can't resurrect something another device deliberately removed. Undo is
a local convenience; it does not try to reach across the merge boundary.

## 8. Clocks and ordering

LWW needs a total order that survives wall-clock skew between a phone and a laptop.
We use a **Hybrid Logical Clock**: `hlc = (physical_ms, counter, deviceId)`. On each
event, `physical_ms = max(now, last_physical)`, bumping `counter` on ties; on
receiving a remote op we advance our clock past its `hlc`. This keeps ordering
causal and monotonic even if one device's clock is off, with `deviceId` as the final
deterministic tiebreak. It's a dozen lines of pure code and removes the single
biggest footgun of naive "newest timestamp wins."

## 9. Data-model changes

- New `journal` object store (keyPath `id`), indexed by `hlc` and by `[store,key]`.
- New device-local settings: `deviceId` (UUID, created once), `deviceName`
  (editable, shown in sync files), version vector, per-peer last-sync marker, state
  hash cache.
- `entries`: add `uid` + index; `foods`: uuid for new ids.
- Split synced vs device-local settings (§2).
- IndexedDB `DB_VERSION` bump with a migration that (a) backfills ids, (b) seeds the
  journal with one synthetic `put` per existing record so history starts consistent,
  (c) relocates device-local settings.

Export/import (the existing JSON backup) stays as a **full snapshot** escape hatch,
independent of the delta sync.

## 10. Sync file format

A gzipped JSON document (reuse `CompressionStream`), shared via the Web Share API
(see §11), suggested extension `.foodlogsync`:

```
{
  format: "foodlog-sync",
  version: 1,
  from:    { deviceId, deviceName },
  createdAt,
  baseline: "since-last-sync" | "since:2026-07-01" | "full",
  versionVector: { deviceId: hlc, ... },   // what the sender has
  ops: [ Op, ... ],                        // the delta
  stateHash: "sha256:…"                    // sender's full-journal hash, for verify
}
```

Import is: validate → union `ops` into the journal by `id` (skipping known ids) →
re-fold affected keys → advance version vector and clock → record the peer's marker
→ show a summary. Idempotent by construction.

## 11. Transport reality (important)

A PWA **cannot send email itself** — there is no API to attach a file to an outgoing
mail. The realistic mechanism is the **Web Share API** (`navigator.share({ files })`,
supported on iOS Safari and Android Chrome): the app produces the file and hands it
to the OS share sheet, where the user chooses **Mail, AirDrop, Messages, or a cloud
drive**. So "email the diff" becomes "**share** the diff," and email is one target
among several. Fallback when Web Share (or file share) is unavailable: a normal
download the user attaches manually, and a file picker (`<input type=file>`) to
apply one.

Privacy note: the file is the food log in **plaintext**; emailing it means it sits
readable in an inbox. A later option is passphrase encryption via WebCrypto
(AES-GCM) before sharing — worth offering but not required for v1.

## 12. UI surface

Settings gains a **Sync** card: this device's name (editable), its current state
hash, and per-peer "last synced" times; a **Create sync file** button (default
*since last sync*, with *since a date* and *full* options) that opens the share
sheet; and an **Apply sync file** picker that imports and shows a summary
(ops applied, records changed, conflicts resolved, resulting hash).

Undo/redo surfaces as two controls (and keyboard shortcuts on desktop), showing what
will be undone ("Undo remove ‘Almonds’"). The existing full JSON export/import stays
as the belt-and-suspenders backup.

## 13. Edge cases and risks

- **Duplicate / out-of-order files** → safe (idempotent, commutative).
- **Clock skew** → mitigated by HLC; a wildly wrong clock on one device could still
  "win" LWW — note in docs; consider clamping absurd future timestamps.
- **Tombstones accumulate** → the journal only grows. Once the version vector shows
  *all known peers* have seen an op, it's safe to **compact** (snapshot the fold and
  truncate). Ship without compaction; add it when journals get large.
- **Three+ devices** → the model handles it (version vectors are per-device), but
  we'll test and support two first.
- **A device restored from an old JSON backup** → its journal is behind; the next
  sync file brings it forward. Full-snapshot import should re-seed the journal.
- **Undo after a merge** → handled by invalidating affected stack entries (§7).

## 14. Testing strategy

The journal, fold, merge, HLC, and hashing are **pure functions** — they belong in a
new `sync.js` with no DOM/IDB, mirroring the project's `lib.js`-is-pure discipline,
and get heavy Node tests. The properties to assert directly:

- **Convergence:** for random op sets split arbitrarily between two devices, merging
  in either direction yields identical materialized state and identical state hash.
- **Idempotency:** applying a file twice == once.
- **Commutativity/associativity:** apply files in any order → same result.
- **LWW correctness:** highest `hlc` wins per key; tombstones suppress.
- **Undo/redo:** inverse ops restore prior state; round-trips are exact.

Plus a headless two-instance browser simulation (two IndexedDB databases in one
page, or two contexts) that exercises the real export→share→import path end to end.

## 15. Phased plan

- **Phase 0 — Identity & clock (invisible).** UUIDs on entries, uuid for new foods,
  `deviceId`, HLC clock, split device-local settings. DB version bump + migration.
  No user-visible change; existing tests stay green.
- **Phase 1 — Journal + undo/redo.** Route every mutation through `applyOp()`
  (append to journal + materialize). Backfill the journal from current data. Add
  undo/redo stacks and their UI. **Ships undo/redo**, which you asked for now, and
  lays the whole sync substrate.
- **Phase 2 — Delta sync.** `sync.js` (fold, merge, version vector, hash), bundle
  export/import, Web Share + file-picker UI, import summary. **Ships sync.**
- **Phase 3 — Polish.** Since-a-date export, per-peer status + state-hash display,
  conflict report, optional passphrase encryption, journal compaction.

Undo/redo (Phase 1) lands before sync (Phase 2) precisely because the journal it
needs is the same journal sync needs — one foundation, both features.

## 16. Open questions for you

1. **Device naming** — auto-generate ("Bob's iPhone") or prompt once? Shown in every
   sync file and the summary.
2. **Default delta baseline** — "since last sync with *this* peer" (needs the app to
   recognize peers) vs. a simpler "since last time I made *any* sync file." The
   former is more precise for 2+ devices; the latter is dead simple for two.
3. **Encryption in v1** or defer to Phase 3? Matters most if you'll actually email
   the files (plaintext in inboxes) vs. AirDrop/local transfer.
4. **Conflict visibility** — is a summary count enough, or do you want a reviewable
   list of what LWW overrode (with an option to keep the other version)?
