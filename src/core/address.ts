/**
 * IPv6 addresses are limited per /64, the block one home or server is
 * usually given, so nobody gets a fresh allowance per address. IPv4 (also
 * when written as IPv6) is left as it is.
 */
export function addressBlock(ip: string): string {
  const address = ip.toLowerCase().replace(/^\[|\](:\d+)?$/g, "").replace(/%.*$/, "");
  if (!address.includes(":")) return address;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return mapped[1];
  const [head, tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
