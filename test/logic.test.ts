import test from "node:test";
import assert from "node:assert/strict";
import { Counters } from "../src/limits";
import { canManage, rank, roleChangeError } from "../src/roles";

test("roles: only the Owner makes a Manager, nobody gives the Owner role", () => {
  assert.match(roleChangeError(["Manager"], "Manager") ?? "", /Only the Owner/);
  assert.equal(roleChangeError(["Owner"], "Manager"), null);
  assert.match(roleChangeError(["Owner"], "Owner") ?? "", /cannot be given/);
  assert.match(roleChangeError(["Supervisor"], "Supervisor") ?? "", /Only the Owner or an admin/);
  assert.equal(roleChangeError(["Supervisor"], "Operator"), null);
  assert.match(roleChangeError(["Owner"], "Janitor") ?? "", /Unknown role/);
});

test("roles: you manage yourself and people below you, never above", () => {
  assert.equal(rank(["Operator"]), 0);
  assert.equal(canManage("a", ["Operator"], "a", ["Operator"]), true);
  assert.equal(canManage("a", ["Supervisor"], "b", ["Operator"]), true);
  assert.equal(canManage("a", ["Supervisor"], "b", ["Manager"]), false);
  assert.equal(canManage("a", ["Manager"], "b", ["Manager"]), false);
  assert.equal(canManage("a", ["Owner"], "b", ["Manager"]), true);
});

test("limits: locks after the allowed failures, and clear lets the key try again", () => {
  const c = new Counters(60_000);
  for (let i = 0; i < 4; i++) c.fail("k", 5, 60_000);
  assert.equal(c.locked("k"), false);
  c.fail("k", 5, 60_000);
  assert.equal(c.locked("k"), true);
  assert.equal(c.locked("other"), false);
  c.clear("k");
  assert.equal(c.locked("k"), false);
});

test("limits: hit reports true only after the maximum", () => {
  const c = new Counters(60_000);
  assert.equal(c.hit("ip", 2), false);
  assert.equal(c.hit("ip", 2), false);
  assert.equal(c.hit("ip", 2), true);
  assert.equal(c.hit("someone-else", 2), false);
});

test("limits: made-up keys cannot grow memory without limit", () => {
  const c = new Counters(60_000);
  for (let i = 0; i < 25_000; i++) c.hit(`k${i}`, 5);
  // @ts-expect-error reading the private map to check its size
  assert.ok(c.m.size <= 20_000);
});
