import assert from "assert";

import { CURRENCY_MAX } from "../src/constants.js";
import { sanitizeProgress } from "../src/sanitize.js";

describe("sanitizeProgress", () => {
  it("rejects non-objects and bounds numbers", () => {
    assert.strictEqual(sanitizeProgress(null), null);
    assert.strictEqual(sanitizeProgress([1]), null);
    const out = sanitizeProgress({ wins: 1e40, skill: -5, bestDistance: NaN, rebirths: 3.7, throws: "x", hack: "x" })!;
    assert.strictEqual(out.wins, CURRENCY_MAX);
    assert.strictEqual(out.skill, 0);
    assert.strictEqual(out.bestDistance, undefined);
    assert.strictEqual(out.rebirths, 3);
    assert.strictEqual(out.throws, undefined);
    assert.ok(!("hack" in out));
  });

  it("keeps well-formed ids and only equips an owned one", () => {
    const out = sanitizeProgress({ tnts: ["stick", "bomb", "bomb", "Bad Id!", 7], tnt: "bomb", trails: ["white"], trail: "red" })!;
    assert.deepStrictEqual(out.tnts, ["stick", "bomb"]);
    assert.strictEqual(out.tnt, "bomb");
    assert.deepStrictEqual(out.trails, ["white"]);
    assert.strictEqual(out.trail, undefined, "an unowned trail is not equipped");
    assert.strictEqual(sanitizeProgress({ trail: null })!.trail, "");
    assert.strictEqual(sanitizeProgress({ tnt: "keg" })!.tnt, "keg", "without the list only the shape is checked");
  });

  it("keeps well-formed pets and caps the equipped ones at the slots", () => {
    const out = sanitizeProgress({
      petSlots: 2,
      pets: [
        { id: 1, kind: "foxy", variant: "normal", equipped: true, locked: false },
        { id: 2, kind: "panda", variant: "golden", equipped: true },
        { id: 3, kind: "Bad Id!", variant: "normal" },
        { id: 4.5, kind: "lion", variant: "normal" },
        { id: 5, kind: "lion", variant: "diamond", equipped: true, locked: true },
        "x",
      ],
      petsSeen: ["foxy:normal", "foxy:normal", "bad", "panda:golden"],
    })!;
    assert.deepStrictEqual(out.pets, [
      { id: 1, kind: "foxy", variant: "normal", equipped: true, locked: false },
      { id: 2, kind: "panda", variant: "golden", equipped: true, locked: false },
      { id: 5, kind: "lion", variant: "diamond", equipped: false, locked: true },
    ]);
    assert.deepStrictEqual(out.petsSeen, ["foxy:normal", "panda:golden"]);
  });

  it("bounds eggs, potions and timers", () => {
    const out = sanitizeProgress({ eggs: { common: 2.9, "bad id": 1 }, potions: { skill: 3 }, boostUntil: { skill: 1e18 }, daily: { streak: 2, last: 5 } })!;
    assert.deepStrictEqual(out.eggs, { common: 2 });
    assert.deepStrictEqual(out.potions, { skill: 3 });
    assert.ok(out.boostUntil!.skill < Date.now() + 31 * 24 * 3600 * 1000);
    assert.deepStrictEqual(out.daily, { streak: 2, last: 5 });
  });
});
