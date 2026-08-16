export class LegalRandomBot {
  constructor({ name = "Legal Random", seed = 1 } = {}) {
    this.name = name;
    this.state = Number(seed) >>> 0 || 1;
  }

  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }

  chooseAction(_observation, legalActions) {
    if (!legalActions.length) throw new Error("LegalRandomBot recibió cero acciones.");
    const nonSurrender = legalActions.filter((action) => action.type !== "SURRENDER");
    const pool = nonSurrender.length ? nonSurrender : legalActions;
    return pool[Math.floor(this.next() * pool.length)];
  }
}
