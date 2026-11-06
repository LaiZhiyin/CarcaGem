// Deterministic shuffle shared by browsers and the game server.
export function seededShuffle<T>(array: T[], seed: number): T[] {
    const arr = [...array];
    let s = seed;
    const rng = () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0x100000000;
    };
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
