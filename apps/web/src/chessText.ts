/** Move text helpers (SAN lines, numbered). */

/** "1. e4 c5 2. Nf3" */
export function lineText(sans: string[]): string {
  return sans.map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${san}`).join(' ');
}

/** The move after `line`, numbered: "3. Bb5", "d6" right after White's move, or "2... d6" alone. */
export function moveText(line: string[], san: string, alone = false): string {
  const ply = line.length;
  if (ply % 2 === 0) return `${ply / 2 + 1}. ${san}`;
  return alone || ply === 0 ? `${(ply + 1) / 2}... ${san}` : san;
}
