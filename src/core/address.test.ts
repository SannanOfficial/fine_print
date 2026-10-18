import assert from "node:assert/strict";
import { test } from "node:test";
import { addressBlock } from "./address.ts";

test("IPv4 addresses are kept as they are", () => {
  assert.equal(addressBlock("203.0.113.9"), "203.0.113.9");
  assert.equal(addressBlock("::ffff:203.0.113.9"), "203.0.113.9");
});

test("IPv6 addresses are grouped by /64", () => {
  assert.equal(addressBlock("2001:db8:abcd:12:1::5"), "2001:db8:abcd:12::/64");
  assert.equal(addressBlock("2001:0DB8:0000:0012:ffff:1:2:3"), "2001:db8:0:12::/64");
  assert.equal(addressBlock("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(addressBlock("[2001:db8:abcd:12::1]:443"), "2001:db8:abcd:12::/64");
  assert.equal(addressBlock("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(addressBlock("::1"), "0:0:0:0::/64");
});

test("two addresses in one /64 share a limit", () => {
  assert.equal(addressBlock("2001:db8:1:2::aaaa"), addressBlock("2001:db8:1:2:ffff:ffff:ffff:ffff"));
});
