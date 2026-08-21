const COLS = 9;

// Four digit/pairing rulesets. "classic" is a faithful match of the
// reference "10000" game (digits 1..base-1, pairing to base — the one
// deliberate deviation from the pattern below, kept for fidelity to
// the reference game). The other three all follow the same pattern:
// digits 0..base-1 (the full, canonical digit set of that base),
// pairing to base-1. "extended" is base 10 (Matt's original variant);
// "octal" and "hex" apply the same pattern to bases 8 and 16. Only the
// digit range and pairing target differ between modes — line-of-sight,
// scoring, row compaction, and Add all stay identical. Hex digits 10-15
// render as A-F (see digitLabel in main.js); the underlying values are
// plain numbers throughout game.js, same as every other mode.
//
// octal's hardSumRange overrides the default HARD_TARGET_SUM_RANGE:
// with only 8 possible digit values, driving the sum-opening count all
// the way down to 0-2 (fine for 9-16 values) makes the search thrash —
// measured at a median ~500ms per board, some over 800ms, clearly
// unfit for a live deal. {2, 7} converges in low single-digit ms at
// the median (max 16ms across 1000 boards, zero outliers) while still
// landing well below the natural ~13-28 openings an unconstrained deal
// produces, so hard mode still reads as deliberately sparse. A
// narrower {3, 6} looked fine on small samples but had a real, rare
// tail (2/300 boards over 500ms, one at 913ms) — narrowing the range
// in an 8-value space costs more than it looks like it should, so this
// was tuned empirically against larger samples, not assumed safe from
// a quick check. hex has no such override: at 16 values it converges
// as fast and reliably as classic/extended do.
const MODES = {
  classic: { id: "classic", label: "Classic (1–9)", minDigit: 1, maxDigit: 9, pairSum: 10 },
  extended: { id: "extended", label: "Extended (0–9)", minDigit: 0, maxDigit: 9, pairSum: 9 },
  octal: { id: "octal", label: "Octal (0–7)", minDigit: 0, maxDigit: 7, pairSum: 7, hardSumRange: { min: 2, max: 7 } },
  hex: { id: "hex", label: "Hex (0–F)", minDigit: 0, maxDigit: 15, pairSum: 15 },
};

// A cell is one of three things: { value, gen } (occupied — gen is 0
// for the initial deal, N for the Nth "Add more numbers" round, so the
// UI can colour successive rounds differently), null (occupied once,
// since matched away), or undefined (never dealt a digit at all — the
// undealt tail of a partial row). The null/undefined distinction matters:
// Add tops up only the undealt tail, never a match's leftover gap.
function makeCell(value, gen) {
  return { value, gen };
}

function randomDigit(minDigit, maxDigit) {
  return minDigit + Math.floor(Math.random() * (maxDigit - minDigit + 1));
}

// Builds one row of COLS cells; only `filled` of them get a digit
// (generation `gen`), the rest are left undealt — used for a partial
// final row when a digit count doesn't divide evenly by COLS.
function createRow(filled, gen, minDigit, maxDigit) {
  return Array.from({ length: COLS }, (_, i) =>
    i < filled ? makeCell(randomDigit(minDigit, maxDigit), gen) : undefined
  );
}

// Deals `total` random digits (drawn from [minDigit, maxDigit]) across
// as many rows as needed, with a partially-filled final row if `total`
// isn't a multiple of COLS.
function createBoard(total, minDigit, maxDigit) {
  const rows = [];
  let remaining = total;
  while (remaining > 0) {
    const filled = Math.min(COLS, remaining);
    rows.push(createRow(filled, 0, minDigit, maxDigit));
    remaining -= filled;
  }
  return rows;
}

function isValidPair(a, b, pairSum) {
  return a === b || a + b === pairSum;
}

// Calibrated against 8 real "10000" hard-mode opening grids Matt sent
// (classic mode, 42 cells): sum-opening counts were 0, 0, 0, 1, 1, 1,
// 1, 2 — centred on 1, never above 2. (An earlier guess of "3, or 2/4
// if 3 is hard to hit" came from Matt's memory of mid-game states, not
// the fresh deal; this range supersedes it now that real openings have
// been measured directly.) Accepting a range rather than one exact
// number means far fewer forced nudges are needed to land in it, which
// matters: each nudge narrows its cell's safe-value pool in a way that
// isn't perfectly even across digits, so minimising nudges keeps the
// deal closer to genuinely random digit selection and distribution.
const HARD_TARGET_SUM_RANGE = { min: 0, max: 2 };

// All positions structurally adjacent to (row, col) on a board with
// `rowCount` rows — the 8 surrounding cells plus the row-wrap join
// (last column of one row to the first column of the next), which is
// the only place "adjacent" differs from ordinary 2D neighbours. Used
// only by hard-mode generation: at deal time the board is fully
// packed, so distance-1 line of sight and structural adjacency are
// the same thing, and there's no need to run the blocking scan.
function adjacentPositions(row, col, rowCount) {
  const positions = [];
  for (const dr of [-1, 0, 1]) {
    for (const dc of [-1, 0, 1]) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rowCount && c >= 0 && c < COLS) positions.push({ row: r, col: c });
    }
  }
  if (col === COLS - 1 && row + 1 < rowCount) positions.push({ row: row + 1, col: 0 });
  if (col === 0 && row - 1 >= 0) positions.push({ row: row - 1, col: COLS - 1 });
  return positions;
}

// Every adjacent pair of occupied cells on `board`, each pair listed
// once. `board` here holds raw digit values (or undefined), not cells.
function adjacentPairs(board) {
  const rowCount = board.length;
  const pairs = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === undefined) continue;
      // Only look "forward" (right, and down/down-left/down-right/wrap)
      // so each pair is counted once.
      const forward = [];
      if (c + 1 < COLS) forward.push({ row: r, col: c + 1 });
      if (r + 1 < rowCount) {
        for (const dc of [-1, 0, 1]) {
          const nc = c + dc;
          if (nc >= 0 && nc < COLS) forward.push({ row: r + 1, col: nc });
        }
      }
      if (c === COLS - 1 && r + 1 < rowCount) forward.push({ row: r + 1, col: 0 });
      for (const pos of forward) {
        if (board[pos.row][pos.col] !== undefined) {
          pairs.push([{ row: r, col: c }, pos]);
        }
      }
    }
  }
  return pairs;
}

function rangeArray(minDigit, maxDigit) {
  return Array.from({ length: maxDigit - minDigit + 1 }, (_, i) => minDigit + i);
}

// Builds a board (same shape as createBoard) where no two adjacent
// cells share the same value — placed left-to-right/top-to-bottom, so
// each new cell only ever needs to check already-placed neighbours.
function buildNoIdenticalAdjacentBoard(total, minDigit, maxDigit) {
  const rowFilled = [];
  let remaining = total;
  while (remaining > 0) {
    const filled = Math.min(COLS, remaining);
    rowFilled.push(filled);
    remaining -= filled;
  }
  const rowCount = rowFilled.length;
  const board = rowFilled.map(() => Array(COLS).fill(undefined));

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < rowFilled[r]; c++) {
      const forbidden = new Set(
        adjacentPositions(r, c, rowCount)
          .map((p) => board[p.row][p.col])
          .filter((v) => v !== undefined)
      );
      const candidates = rangeArray(minDigit, maxDigit).filter((v) => !forbidden.has(v));
      const pool = candidates.length > 0 ? candidates : rangeArray(minDigit, maxDigit);
      board[r][c] = pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return board;
}

// If pairSum is even, its half (e.g. 5 under classic mode's sum-10)
// is its own complement — the only digit that can never take part in
// a sum-match once the no-identical-adjacent invariant is in force,
// since its only possible partner is another copy of itself, which
// that invariant forbids. Extended mode's sum-9 is odd, so it has no
// such digit at all.
function selfComplementDigit(minDigit, maxDigit, pairSum) {
  if (pairSum % 2 !== 0) return null;
  const half = pairSum / 2;
  return half >= minDigit && half <= maxDigit ? half : null;
}

// Picks a new value for the cell at `pos` that clashes with no adjacent
// neighbour — neither identically (preserving the no-identical-adjacent
// invariant) nor by summing to `pairSum` with one. Avoiding new sum-
// matches too matters here: without it, a reduction step is a "blind"
// move that can accidentally create a match elsewhere while fixing the
// one it targeted, turning convergence toward a tight sum-opening
// target into a noisy random walk instead of a clean descent — that
// caused real (not just slow) convergence failures once the target
// tightened to HARD_TARGET_SUM_RANGE's 0-2. This naturally favours the
// self-complement digit when one exists (it's the only value that can
// never create a new sum-match with an unmatched neighbour), which
// used to be treated as a bug to suppress; now that adjustSelfComplementCount
// deliberately targets a higher share for that digit, the two work
// together instead of against each other. Mutates `board`.
function replaceCellPreservingNoIdentical(board, pos, minDigit, maxDigit, pairSum) {
  const neighborValues = adjacentPositions(pos.row, pos.col, board.length)
    .map((p) => board[p.row][p.col])
    .filter((v) => v !== undefined);
  const identicalForbidden = new Set(neighborValues);
  const sumForbidden = new Set(neighborValues.map((v) => pairSum - v));

  const strict = rangeArray(minDigit, maxDigit).filter(
    (v) => !identicalForbidden.has(v) && !sumForbidden.has(v)
  );
  const fallback = rangeArray(minDigit, maxDigit).filter((v) => !identicalForbidden.has(v));
  const pool = strict.length > 0 ? strict : fallback.length > 0 ? fallback : rangeArray(minDigit, maxDigit);
  board[pos.row][pos.col] = pool[Math.floor(Math.random() * pool.length)];
}

// Classic mode's reference "10000" doesn't suppress the self-complement
// digit (5, under sum-10) toward a fair 1-in-9 share — it deliberately
// runs it at roughly double that. Measured across 8 real hard-mode
// opening grids (42 cells each): 9, 9, 9, 9, 8, 9, 8, 8 — always 8 or
// 9, never outside that band. The reasoning holds up: every other
// digit can pair two ways (another copy of itself, or its complement),
// but 5 only pairs with another 5, so roughly doubling its supply
// keeps its pool of potential partners comparable to everyone else's
// instead of leaving it structurally undermatched.
const SELF_COMPLEMENT_TARGET_RANGE = { min: 8, max: 9 };

// Nudges the self-complement digit's count into SELF_COMPLEMENT_TARGET_RANGE.
// Adding it (converting a non-self-complement cell that has no neighbour
// already holding it, so no identical-adjacent violation) is always safe
// with respect to adjustToTargetSumPairs' already-achieved result: the
// self-complement digit's only possible sum-partner is another copy of
// itself — already forbidden by the invariant this only ever adds to —
// so it can never create a new sum-match. Trimming excess (now that
// reduction in adjustToTargetSumPairs naturally favours this digit, it
// can occasionally land above the target range on its own) uses
// replaceCellPreservingNoIdentical, which explicitly avoids creating a
// new sum-match too, so it doesn't undo the sum-range work either. No-op
// under extended mode (no self-complement digit exists there).
function adjustSelfComplementCount(board, minDigit, maxDigit, pairSum, range) {
  const selfComplement = selfComplementDigit(minDigit, maxDigit, pairSum);
  if (selfComplement === null) return;

  const countSelfComplement = () => board.flat().filter((v) => v === selfComplement).length;

  let guard = 0;
  while (guard++ < 5000) {
    const count = countSelfComplement();
    if (count >= range.min && count <= range.max) return;

    if (count > range.max) {
      const cells = [];
      board.forEach((row, r) => row.forEach((v, c) => { if (v === selfComplement) cells.push({ row: r, col: c }); }));
      const pick = cells[Math.floor(Math.random() * cells.length)];
      replaceCellPreservingNoIdentical(board, pick, minDigit, maxDigit, pairSum);
      continue;
    }

    const candidates = [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        if (board[r][c] === undefined || board[r][c] === selfComplement) continue;
        const neighborValues = adjacentPositions(r, c, board.length).map((p) => board[p.row][p.col]);
        if (!neighborValues.includes(selfComplement)) candidates.push({ row: r, col: c });
      }
    }
    if (candidates.length === 0) return; // no cell can safely take it — settle for what we have
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    board[pick.row][pick.col] = selfComplement;
  }
}

// The digits at `pos` that clash with no adjacent neighbour — neither
// identically nor by summing to `pairSum` with one. A cell reassigned
// to one of these can never create a new match, only ever lose the
// one(s) it already had.
function strictCandidates(board, pos, minDigit, maxDigit, pairSum) {
  const neighborValues = adjacentPositions(pos.row, pos.col, board.length)
    .map((p) => board[p.row][p.col])
    .filter((v) => v !== undefined);
  const identicalForbidden = new Set(neighborValues);
  const sumForbidden = new Set(neighborValues.map((v) => pairSum - v));
  return rangeArray(minDigit, maxDigit).filter(
    (v) => !identicalForbidden.has(v) && !sumForbidden.has(v)
  );
}

// Nudges `board` (no-identical-adjacent already guaranteed) until the
// count of adjacent pairs summing to `pairSum` falls within
// `range.min`..`range.max`, by replacing one side of an excess match
// (with a value that clashes with nothing adjacent) or one side of a
// non-match (with its neighbour's exact complement) as needed. Stops
// the moment the count is anywhere in range rather than forcing one
// exact number, since every nudge is a deliberate (non-uniform) choice
// rather than a random deal, so fewer nudges means a more natural
// board. Runs as a single loop that re-checks the count every step and
// corrects in whichever direction is short, since either kind of step
// can occasionally overshoot or undershoot on its own (e.g.
// neutralising a cell that was matching more than one neighbour).
//
// Reducing excess matches specifically checks several candidate pairs
// (both sides of each) for a strictCandidates move — one that provably
// can't create a new match — before ever risking a plain identical-only
// reassignment that might. Without that search, picking one random
// matching pair and accepting whatever mutation comes back turned
// convergence toward a tight range into a noisy random walk that
// sometimes never reached it even after 150000 iterations at 76ms/board
// — an algorithmic dead end, not a budget one. Bounded retries; settles
// for "close" in the vanishingly unlikely case it still can't land in
// range.
function adjustToTargetSumPairs(board, minDigit, maxDigit, pairSum, range) {
  const countMatches = () =>
    adjacentPairs(board).filter(
      ([a, b]) => board[a.row][a.col] + board[b.row][b.col] === pairSum
    );

  let guard = 0;
  while (guard++ < 40000) {
    const matches = countMatches();
    if (matches.length >= range.min && matches.length <= range.max) return;

    if (matches.length > range.max) {
      const shuffled = [...matches].sort(() => Math.random() - 0.5);
      let mutated = false;
      for (const [a, b] of shuffled) {
        const aCand = strictCandidates(board, a, minDigit, maxDigit, pairSum);
        if (aCand.length > 0) {
          board[a.row][a.col] = aCand[Math.floor(Math.random() * aCand.length)];
          mutated = true;
          break;
        }
        const bCand = strictCandidates(board, b, minDigit, maxDigit, pairSum);
        if (bCand.length > 0) {
          board[b.row][b.col] = bCand[Math.floor(Math.random() * bCand.length)];
          mutated = true;
          break;
        }
      }
      if (!mutated) {
        const [a] = matches[Math.floor(Math.random() * matches.length)];
        replaceCellPreservingNoIdentical(board, a, minDigit, maxDigit, pairSum);
      }
      continue;
    }

    const nonMatching = adjacentPairs(board).filter(
      ([a, b]) => board[a.row][a.col] + board[b.row][b.col] !== pairSum
    );
    if (nonMatching.length === 0) return;
    const [a, b] = nonMatching[Math.floor(Math.random() * nonMatching.length)];
    const wanted = pairSum - board[a.row][a.col];
    if (wanted < minDigit || wanted > maxDigit || wanted === board[a.row][a.col]) continue;

    const bOtherNeighborValues = adjacentPositions(b.row, b.col, board.length)
      .filter((p) => !(p.row === a.row && p.col === a.col))
      .map((p) => board[p.row][p.col])
      .filter((v) => v !== undefined);
    if (bOtherNeighborValues.includes(wanted)) continue; // would create an identical-adjacent pair
    if (bOtherNeighborValues.some((v) => v + wanted === pairSum)) continue; // would create an extra, unintended match

    board[b.row][b.col] = wanted;
  }
}

// Hard mode's initial deal: same shape and total as createBoard, but
// constructed so no two adjacent cells share a value (so every
// adjacent-identical "opening" is structurally impossible), the count
// of adjacent pairs summing to `pairSum` — the only openings available
// at the start of the game — falls within `sumRange`, and the self-
// complement digit (if the mode has one) is topped up to
// `selfComplementRange`. The self-complement top-up runs last since
// it's proven not to disturb the sum-pair count once achieved.
function createHardBoard(
  total,
  minDigit,
  maxDigit,
  pairSum,
  sumRange = HARD_TARGET_SUM_RANGE,
  selfComplementRange = SELF_COMPLEMENT_TARGET_RANGE
) {
  const raw = buildNoIdenticalAdjacentBoard(total, minDigit, maxDigit);
  adjustToTargetSumPairs(raw, minDigit, maxDigit, pairSum, sumRange);
  adjustSelfComplementCount(raw, minDigit, maxDigit, pairSum, selfComplementRange);
  return raw.map((row) => row.map((v) => (v === undefined ? undefined : makeCell(v, 0))));
}

function flatIndex(row, col) {
  return row * COLS + col;
}

function cellAt(board, row, col) {
  return board[row]?.[col] ?? null;
}

// Horizontal line of sight treats the whole board as one flattened
// sequence, so it wraps from the end of a row into the start of the
// next without needing special-case handling per row boundary.
function horizontalSight(board, a, b) {
  const iA = flatIndex(a.row, a.col);
  const iB = flatIndex(b.row, b.col);
  const step = iA < iB ? 1 : -1;
  for (let i = iA + step; i !== iB; i += step) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    if (cellAt(board, row, col) !== null) return null;
  }
  return Math.abs(iB - iA);
}

function verticalSight(board, a, b) {
  if (a.col !== b.col) return null;
  const step = a.row < b.row ? 1 : -1;
  for (let row = a.row + step; row !== b.row; row += step) {
    if (cellAt(board, row, a.col) !== null) return null;
  }
  return Math.abs(b.row - a.row);
}

function diagonalSight(board, a, b) {
  const rowDiff = b.row - a.row;
  const colDiff = b.col - a.col;
  if (Math.abs(rowDiff) !== Math.abs(colDiff) || rowDiff === 0) return null;
  const rowStep = rowDiff > 0 ? 1 : -1;
  const colStep = colDiff > 0 ? 1 : -1;
  let row = a.row + rowStep;
  let col = a.col + colStep;
  while (row !== b.row) {
    if (cellAt(board, row, col) !== null) return null;
    row += rowStep;
    col += colStep;
  }
  return Math.abs(rowDiff);
}

// Returns the shortest valid line-of-sight distance between two
// distinct cells, or null if no line connects them.
function lineOfSightDistance(board, a, b) {
  const distances = [
    horizontalSight(board, a, b),
    verticalSight(board, a, b),
    diagonalSight(board, a, b),
  ].filter((d) => d !== null);
  if (distances.length === 0) return null;
  return Math.min(...distances);
}

// Attempts to match the two given positions. Mutates `board` on
// success: clears both cells and drops any row left fully empty,
// shifting the rows below it up. Returns the score earned, or null
// if the attempt was invalid.
function attemptMatch(board, a, b, pairSum) {
  if (a.row === b.row && a.col === b.col) return null;

  const cellA = cellAt(board, a.row, a.col);
  const cellB = cellAt(board, b.row, b.col);
  if (cellA === null || cellB === null) return null;
  if (!isValidPair(cellA.value, cellB.value, pairSum)) return null;

  const distance = lineOfSightDistance(board, a, b);
  if (distance === null) return null;

  board[a.row][a.col] = null;
  board[b.row][b.col] = null;

  for (const row of [...new Set([a.row, b.row])].sort((x, y) => y - x)) {
    if (board[row].every((cell) => cell == null)) {
      board.splice(row, 1);
    }
  }

  return distance;
}

function occupiedCells(board) {
  const cells = [];
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell) cells.push({ row: r, col: c, value: cell.value, gen: cell.gen });
    });
  });
  return cells;
}

// Every valid, line-of-sight-connected pair on the board, in scan
// order — used to let Hint rotate through options on repeated presses
// rather than always showing the same one.
function findAllValidMoves(board, pairSum) {
  const cells = occupiedCells(board);
  const moves = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (!isValidPair(cells[i].value, cells[j].value, pairSum)) continue;
      if (lineOfSightDistance(board, cells[i], cells[j]) !== null) {
        moves.push({
          a: { row: cells[i].row, col: cells[i].col },
          b: { row: cells[j].row, col: cells[j].col },
        });
      }
    }
  }
  return moves;
}

// Returns the first valid, line-of-sight-connected pair found — scan
// order doesn't matter for Hint's purposes, only whether one exists —
// or null if the board has no valid move at all.
function findValidMove(board, pairSum) {
  return findAllValidMoves(board, pairSum)[0] ?? null;
}

// Whether any valid, line-of-sight-connected pair still exists on the board.
function hasValidMove(board, pairSum) {
  return findValidMove(board, pairSum) !== null;
}

// Fills the trailing run of never-dealt empty cells at the end of
// `row` (not any mid-row gaps left by earlier matches) with values
// from `pool`, starting at `poolIndex`. Returns the new poolIndex.
function fillTrailingGap(row, pool, poolIndex, generation) {
  let tailStart = COLS;
  for (let c = COLS - 1; c >= 0; c--) {
    if (row[c] === undefined) tailStart = c;
    else break;
  }
  for (let c = tailStart; c < COLS && poolIndex < pool.length; c++) {
    row[c] = makeCell(pool[poolIndex], generation);
    poolIndex++;
  }
  return poolIndex;
}

// Collects every digit still on the board, in reading order, and
// places one duplicate copy of that exact sequence (tagged with
// `generation`, order preserved — not shuffled, matching the
// reference game): first into any undealt trailing gap in the current
// last row, then as new rows appended below. Doubles the board, not
// triples it, since the original cells are left untouched. Mutates
// `board`. No-op if the board is already empty (nothing to duplicate).
function addMoreNumbers(board, generation) {
  const pool = occupiedCells(board).map((cell) => cell.value);
  if (pool.length === 0) return;

  let poolIndex = 0;

  if (board.length > 0) {
    poolIndex = fillTrailingGap(board[board.length - 1], pool, poolIndex, generation);
  }

  for (let i = poolIndex; i < pool.length; i += COLS) {
    const values = pool.slice(i, i + COLS);
    const row = values.map((value) => makeCell(value, generation));
    while (row.length < COLS) row.push(undefined);
    board.push(row);
  }
}

export {
  COLS,
  MODES,
  createBoard,
  createHardBoard,
  createRow,
  isValidPair,
  lineOfSightDistance,
  attemptMatch,
  hasValidMove,
  findValidMove,
  findAllValidMoves,
  addMoreNumbers,
};
