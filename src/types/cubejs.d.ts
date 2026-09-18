// Minimal ambient declaration for cubejs (untyped on npm).
declare module "cubejs" {
  export default class Cube {
    constructor(state?: unknown);
    /** Apply an alg string ("R U R' F2"), mutating and returning this cube. */
    move(alg: string): this;
    /** 54-character facelet string in URFDLB order. */
    asString(): string;
    isSolved(): boolean;
    /** Kociemba two-phase solve; requires initSolver() first. */
    solve(maxDepth?: number): string;
    static fromString(facelets: string): Cube;
    static initSolver(): void;
  }
}
