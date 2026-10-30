import { MongoClient, type Collection } from "mongodb";

import { LEADERBOARD_STATS } from "./constants.js";

// Bloxity Legion hosting injects MONGODB_URI per game+channel -- an isolated database with
// scoped credentials. A local `npm start` normally has no Mongo reachable, so a missing or
// unreachable URI must degrade to "no persistence" rather than crash the room.

// The persisted client state (what `saveProgress` carries, see sanitize.ts). The client keeps
// nothing in the browser: this document is the player's only save.
export interface PlayerDoc {
  _id: string; // Bloxity user id -- see WorldRoom.ts (guests are never saved)
  username?: string; // display name as of the last save
  skill?: number;
  wins?: number; // the currency
  rebirths?: number;
  throws?: number;
  bestDistance?: number; // only ever goes up
  playtime?: number; // s with the game visible, all sessions
  spent?: number; // Robux spent (no purchases yet)
  tnts?: string[]; // owned TNT ids
  tnt?: string; // equipped TNT
  trails?: string[];
  trail?: string; // equipped trail, "" = none
  pets?: SavedPet[];
  nextPet?: number;
  petSlots?: number;
  petsSeen?: string[]; // "kind:variant"
  indexClaimed?: number;
  eggs?: Record<string, number>;
  potions?: Record<string, number>;
  boostUntil?: Record<string, number>; // potion id -> epoch ms
  daily?: { streak: number; last: number };
  worlds?: string[]; // unlocked worlds (client WORLDS ids)
  world?: string; // the world the player is in, "" = the start world
  lastSeen?: number;
  // Spin wheel (spin.ts): written only by the server's `spin` handler, never by saveProgress.
  spins?: number;
  spinAt?: number;
  // Daily Reward (daily.ts): written by the server only, never by saveProgress.
  dailyDay?: number;
  dailyLast?: number;
  dailyClaimed?: number[];
  version: number;
  updatedAt: Date;
}

// One owned pet: its kind (client PET_KINDS key) and variant (normal / golden / diamond / exclusive).
export interface SavedPet {
  id: number;
  kind: string;
  variant: string;
  equipped: boolean;
  locked: boolean;
}

let client: MongoClient | null = null;
let players: Collection<PlayerDoc> | null = null;

export async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[db] MONGODB_URI not set -- player progress will not persist");
    return;
  }
  try {
    client = new MongoClient(uri);
    await client.connect();
    // No dbName passed to .db() -- the injected URI already points at this game+channel's database.
    players = client.db().collection<PlayerDoc>("players");
    console.log("[db] connected to MongoDB");
    // The leaderboards sort and count by these (leaderboard.ts).
    for (const stat of LEADERBOARD_STATS) {
      players.createIndex({ [stat]: -1 }).catch((err) => console.warn(`[db] index on ${stat} failed`, err));
    }
  } catch (err) {
    console.warn("[db] connect failed -- player progress will not persist:", err);
    client = null;
    players = null;
  }
}

// Null whenever Mongo is unset/unreachable -- every caller must treat that as "skip persistence".
export function getPlayers(): Collection<PlayerDoc> | null {
  return players;
}

// Test-only seam: exercise the save/load logic against an in-memory fake collection.
export function __setPlayersForTest(fake: Collection<PlayerDoc> | null): void {
  players = fake;
}
