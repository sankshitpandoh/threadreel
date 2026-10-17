// Small seedable PRNG (mulberry32) so tie-breaks are reproducible for a seed.
export class Random {
  constructor(seed) {
    this.state = (seed === undefined ? (Math.random() * 0x100000000) >>> 0 : seed >>> 0) || 1;
  }

  float() {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  intn(n) {
    return Math.floor(this.float() * n);
  }

  pick(list) {
    return list[this.intn(list.length)];
  }
}
