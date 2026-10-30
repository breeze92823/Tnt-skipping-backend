import {
  CURRENCY_MAX, REBIRTHS_MAX, THROWS_MAX, DISTANCE_MAX, PLAY_SECONDS_MAX, OWNED_MAX, PETS_MAX,
  PET_SLOTS_MAX, POTION_KINDS_MAX, POTION_COUNT_MAX, BOOST_MAX_MS, ID_PATTERN,
} from "./constants.js";
import type { PlayerDoc, SavedPet } from "./db.js";

export function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
export function clampNum(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}
export function clampInt(v: number, max: number, min = 0): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}
function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);
// "kind:variant" Pet Index keys.
const isSeen = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{1,32}$/.test(v);

// Catalog ids (TNTs, trails): slug strings, no duplicates, bounded count.
export function sanitizeIds(raw: unknown, max = OWNED_MAX): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isId))].slice(0, max);
}

// Owned pets { id, kind, variant, equipped, locked }: slug kinds / variants, integer ids, at most
// PETS_MAX, and no more than `slots` of them equipped (the extra ones are unequipped, never dropped).
export function sanitizePets(raw: unknown, slots = PET_SLOTS_MAX): SavedPet[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedPet[] = [];
  let equipped = 0;
  for (const p of raw) {
    if (out.length >= PETS_MAX) break;
    if (!isObject(p) || !isId(p.kind) || !isId(p.variant) || !Number.isInteger(p.id)) continue;
    const on = p.equipped === true && equipped < slots;
    if (on) equipped++;
    out.push({ id: clampInt(p.id as number, 1e9), kind: p.kind, variant: p.variant, equipped: on, locked: p.locked === true });
  }
  return out;
}

// { id: n } maps (eggs, potions): slug ids, whole non-negative counts, bounded kinds.
function sanitizeCounts(raw: unknown, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(raw)) return out;
  for (const [id, n] of Object.entries(raw)) {
    if (Object.keys(out).length >= POTION_KINDS_MAX) break;
    if (isId(id) && finite(n)) out[id] = clampInt(n, max);
  }
  return out;
}

// Potion timers { id: epoch ms }: not more than BOOST_MAX_MS ahead of the server clock.
function sanitizeTimers(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(raw)) return out;
  const top = Date.now() + BOOST_MAX_MS;
  for (const [id, n] of Object.entries(raw)) {
    if (Object.keys(out).length >= POTION_KINDS_MAX) break;
    if (isId(id) && finite(n)) out[id] = clampInt(n, top);
  }
  return out;
}

// The game is client-authoritative -- no server-side gameplay validation. What IS enforced:
// shape and bounds, so a malformed payload can never corrupt this player's own Mongo document.
// A forged number can only ever affect the sender's own save.
export function sanitizeProgress(raw: unknown): Partial<PlayerDoc> | null {
  if (!isObject(raw)) return null;
  const out: Partial<PlayerDoc> = {};

  if (finite(raw.skill)) out.skill = clampNum(raw.skill, CURRENCY_MAX);
  if (finite(raw.wins)) out.wins = clampNum(raw.wins, CURRENCY_MAX);
  if (finite(raw.rebirths)) out.rebirths = clampInt(raw.rebirths, REBIRTHS_MAX);
  if (finite(raw.throws)) out.throws = clampInt(raw.throws, THROWS_MAX);
  if (finite(raw.bestDistance)) out.bestDistance = clampNum(raw.bestDistance, DISTANCE_MAX);
  if (finite(raw.playtime)) out.playtime = clampInt(raw.playtime, PLAY_SECONDS_MAX);
  if (finite(raw.spent)) out.spent = clampNum(raw.spent, CURRENCY_MAX);
  if (finite(raw.lastSeen)) out.lastSeen = clampInt(raw.lastSeen, Date.now() + 10 * 60 * 1000);

  if (raw.tnts !== undefined) out.tnts = sanitizeIds(raw.tnts);
  // The equipped one must be owned when this save carries the list; otherwise trust the id's shape.
  if (isId(raw.tnt) && (!out.tnts || out.tnts.includes(raw.tnt))) out.tnt = raw.tnt;
  if (raw.trails !== undefined) out.trails = sanitizeIds(raw.trails);
  if (raw.trail === "" || raw.trail === null) out.trail = "";
  else if (isId(raw.trail) && (!out.trails || out.trails.includes(raw.trail))) out.trail = raw.trail;

  // Worlds: the unlocked ids (kept through rebirths) and the one the player is in, "" = the start world.
  if (raw.worlds !== undefined) out.worlds = sanitizeIds(raw.worlds);
  if (raw.world === "") out.world = "";
  else if (isId(raw.world) && (!out.worlds || out.worlds.includes(raw.world))) out.world = raw.world;

  if (finite(raw.petSlots)) out.petSlots = clampInt(raw.petSlots, PET_SLOTS_MAX, 1);
  if (raw.pets !== undefined) out.pets = sanitizePets(raw.pets, out.petSlots ?? PET_SLOTS_MAX);
  if (finite(raw.nextPet)) out.nextPet = clampInt(raw.nextPet, 1e9, 1);
  if (Array.isArray(raw.petsSeen)) out.petsSeen = [...new Set(raw.petsSeen.filter(isSeen))].slice(0, 512);
  if (finite(raw.indexClaimed)) out.indexClaimed = clampInt(raw.indexClaimed, 1e6);

  if (raw.eggs !== undefined) out.eggs = sanitizeCounts(raw.eggs, POTION_COUNT_MAX);
  if (raw.potions !== undefined) out.potions = sanitizeCounts(raw.potions, POTION_COUNT_MAX);
  if (raw.boostUntil !== undefined) out.boostUntil = sanitizeTimers(raw.boostUntil);
  if (isObject(raw.daily) && finite(raw.daily.streak) && finite(raw.daily.last)) {
    out.daily = { streak: clampInt(raw.daily.streak, 1e6), last: clampInt(raw.daily.last, Date.now() + 10 * 60 * 1000) };
  }
  return out;
}
