import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { AVATAR_MAX_LEN, FX_PER_SECOND, POSE_BOUNDS, PRESENCE_PETS_MAX } from "../src/constants.js";
import { sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("presence", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());

  it("takes the pose, gear and look from the join options", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, {
      userId: "guest-a",
      pose: { x: 3, y: 0.5, z: -12, yaw: Math.PI, speed: 4, air: true },
      loadout: { tnt: "bomb", trail: "red", pets: [{ kind: "foxy", variant: "golden" }], world: "city" },
      avatar: '{"equipped":{}}',
    });
    await sleep(50);
    const p = room.state.players.get(a.sessionId)!;
    assert.deepStrictEqual([p.x, p.y, p.z, p.speed, p.air], [3, 0.5, -12, 4, true]);
    assert.ok(Math.abs(Math.abs(p.yaw) - Math.PI) < 1e-5);
    assert.deepStrictEqual([p.tnt, p.trail, p.pets, p.world], ["bomb", "red", "foxy:golden", "city"]);
    assert.strictEqual(p.avatar, '{"equipped":{}}');
  });

  it("bounds poses and gear and relays them to the others", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    await sleep(50);
    a.send("pose", { x: 1e9, y: "high", z: -1e12, yaw: 7, speed: -3 });
    const pets = Array.from({ length: 20 }, () => ({ kind: "cat", variant: "normal" }));
    a.send("loadout", { tnt: "Bad Id!", trail: "", pets: [...pets, { kind: "x", variant: "Bad!" }], world: "Bad World!" });
    a.send("setAvatar", { avatar: "x".repeat(AVATAR_MAX_LEN + 1) });
    await sleep(100);
    const p = room.state.players.get(a.sessionId)!;
    assert.strictEqual(p.x, POSE_BOUNDS.xy);
    assert.strictEqual(p.y, 0, "a non-number is ignored");
    assert.strictEqual(p.z, -POSE_BOUNDS.z);
    assert.ok(Math.abs(p.yaw - Math.atan2(Math.sin(7), Math.cos(7))) < 1e-5, "yaw wrapped to -PI..PI");
    assert.strictEqual(p.speed, 0);
    assert.strictEqual(p.tnt, "", "a malformed id is ignored");
    assert.strictEqual(p.world, "", "a malformed world is ignored");
    assert.strictEqual(p.pets.split(",").length, PRESENCE_PETS_MAX);
    assert.strictEqual(p.avatar, "", "an oversized look is ignored");

    const seen = (b.state as any).players.get(a.sessionId);
    assert.strictEqual(seen.x, POSE_BOUNDS.xy);
  });

  it("relays throw effects to the others only, bounded and rate-limited", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    await sleep(50);
    const got: any[] = [];
    const echoed: any[] = [];
    b.onMessage("fx", (m: any) => got.push(m));
    a.onMessage("fx", (m: any) => echoed.push(m));
    a.send("fx", { type: "boom", x: 2, z: -400, zone: 2, tier: 3, junk: 1 });
    a.send("fx", { type: "nope" });
    await sleep(100);
    assert.strictEqual(got.length, 1, "an unknown type is dropped");
    assert.deepStrictEqual(got[0], { type: "boom", x: 2, z: -400, zone: 2, tier: 3, id: a.sessionId });
    assert.strictEqual(echoed.length, 0, "the sender does not get its own effects back");

    got.length = 0;
    for (let i = 0; i < FX_PER_SECOND + 20; i++) a.send("fx", { type: "fly", x: 0, y: 1, z: -i });
    await sleep(200);
    assert.ok(got.length <= FX_PER_SECOND, "over the rate limit is dropped");
  });
});
