import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicAddress, safeFetch } from "./fetch.ts";

test("isPublicAddress refuses loopback, private and link-local ranges", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test("safeFetch refuses names and literals that point at this machine", async () => {
  await assert.rejects(safeFetch("https://127.0.0.1/", { allowedHosts: new Set(["127.0.0.1"]), accept: "html" }), /non-public/);
  await assert.rejects(safeFetch("https://localhost/", { allowedHosts: new Set(["localhost"]), accept: "html" }), /non-public/);
});
