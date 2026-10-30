import { AVATAR_MAX_LEN, ID_PATTERN, POSE_BOUNDS, PRESENCE_PETS_MAX, FX_TYPES } from "./constants.js";
import type { PlayerState } from "./rooms/schema/WorldState.js";

// Presence: what the other clients need to draw a player in the world (client remotePlayers.js).
// Relayed through the roster as sent, only bounded here -- like the rest of the game it is
// client-authoritative and purely cosmetic.

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);

// `pose` { x, y, z, yaw, speed, air }: the feet position in world metres, heading (rad), ground
// speed (m/s) and whether the player is airborne.
export function applyPose(p: PlayerState, msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  const b = POSE_BOUNDS;
  if (finite(m.x)) p.x = clamp(m.x, -b.xy, b.xy);
  if (finite(m.y)) p.y = clamp(m.y, -b.xy, b.xy);
  if (finite(m.z)) p.z = clamp(m.z, -b.z, b.xy);
  if (finite(m.yaw)) p.yaw = Math.atan2(Math.sin(m.yaw), Math.cos(m.yaw));
  if (finite(m.speed)) p.speed = clamp(m.speed, 0, b.speed);
  if (typeof m.air === "boolean") p.air = m.air;
}

// `loadout` { tnt, trail, pets: [{ kind, variant }], world }: equipped catalog ids ("" = none) and
// the world the player is in. Pets travel as "kind:variant" joined by commas, capped at PRESENCE_PETS_MAX.
export function applyLoadout(p: PlayerState, msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  for (const key of ["tnt", "trail", "world"] as const) {
    const v = m[key];
    if (v === "" || isId(v)) p[key] = v as string;
  }
  if (Array.isArray(m.pets)) {
    const pets: string[] = [];
    for (const pet of m.pets) {
      if (pets.length >= PRESENCE_PETS_MAX) break;
      const k = (pet as { kind?: unknown })?.kind;
      const v = (pet as { variant?: unknown })?.variant;
      if (isId(k) && isId(v)) pets.push(`${k}:${v}`);
    }
    p.pets = pets.join(",");
  }
}

// `fx` { type, ... }: a throw's visible moments (the TNT in flight, a skip, the blast), relayed as
// sent to everyone else in the room, only bounded here. Returns the cleaned message or null.
export function cleanFx(msg: unknown): Record<string, unknown> | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (!(FX_TYPES as readonly unknown[]).includes(m.type)) return null;
  const out: Record<string, unknown> = { type: m.type };
  const b = POSE_BOUNDS;
  for (const key of ["x", "y", "z", "vz", "spin", "k"] as const) {
    if (finite(m[key])) out[key] = clamp(m[key] as number, -b.z, b.z);
  }
  for (const key of ["zone", "tier"] as const) {
    if (Number.isInteger(m[key])) out[key] = clamp(m[key] as number, 0, 64);
  }
  if (isId(m.tnt)) out.tnt = m.tnt;
  if (isId(m.trail)) out.trail = m.trail;
  return out;
}

// `setAvatar` { avatar }: the Bloxity look as an opaque JSON string ("" = default), length-capped.
export function applyAvatar(p: PlayerState, msg: unknown): void {
  const a = (msg as { avatar?: unknown })?.avatar;
  if (typeof a === "string" && a.length <= AVATAR_MAX_LEN) p.avatar = a;
}
