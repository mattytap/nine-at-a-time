# Nine at a Time

A browser prototype of a game (mechanics TBD from reference screenshots), with an iOS port planned once the browser version is solid.

## Status

Core mechanics implemented, based on the reference game ("Matching Numbers", aka "10000"). Board is a 9-column grid. Tap two cells to pair them: valid pairs are two identical digits, or two digits summing to the mode's pair target. A pair is only valid if there's a clear line of sight between the two cells — horizontal, vertical, or diagonal (45° only) — where every cell strictly between them is already cleared; horizontal line of sight wraps from the end of one row into the start of the next, treating the pair of rows as one 18-cell sequence. Score is 1 point for an adjacent pair, plus 1 for every additional empty step between them. A row is deleted, and the rows below shift up, as soon as its last digit is cleared.

Four selectable modes, switchable via a dropdown in the header (switching deals a fresh board under the new mode — it doesn't try to hot-swap mid-game): **Classic (1–9)**, pairing on sum-to-10, faithful to the reference "10000" game, and the default; **Extended (0–9)**, pairing on sum-to-9; **Octal (0–7)**, pairing on sum-to-7; and **Hex (0–F)**, pairing on sum-to-15, with digits 10–15 shown as the letters A–F. Extended, Octal, and Hex all follow the same pattern — the full digit set of that base (0 through base−1), pairing to base−1 — while Classic deliberately keeps its own 1–9/sum-10 shape to stay faithful to the reference game. All four use the same 9-column board, line-of-sight rules, scoring, and Add mechanic — only the digit range and pair target (and, for Hex, how digits are displayed) differ.

The board deals 42 digits (matching the reference "10000" game's initial count) rather than a round number of rows — deliberately even, and dealt as 4 full rows of 9 plus a partially-filled 5th row of 6, rather than padding out to a full row. Total cell count has to stay even: matches remove cells two at a time and each Add round doubles whatever remains (always an even amount), so an odd starting total could mathematically never reach zero and the board could never be fully cleared.

"Add more numbers" is a manual-only button (never auto-triggered) backed by 5 lives: it collects every digit still on the board, in reading order, and places one duplicate copy of that *exact same sequence* — not shuffled, matching the reference "10000" game exactly — first topping up any undealt trailing cells in the current last row, then appending further full rows below for whatever's left. Doubles the board, not triples it (an earlier version accidentally appended two copies on top of the untouched originals, which is what caused the "adding way too many digits" bug). Each press costs a life regardless of whether the board was actually stuck. Game over is reached only when no valid pair remains anywhere on the board *and* lives have run out; reaching zero cells is a win. Simulating 10,000 games with both fixes and the 42-digit deal: 85.5% now fully clear, using under 3 of the 5 lives on average.

Cells are one of three states, not two: occupied, matched-and-cleared (`null`), or never-dealt (`undefined`) — that distinction is what lets Add correctly top up only the undealt tail of the last row rather than also refilling gaps a match left mid-row.

Cells from odd-numbered Add rounds render in yellow, even rounds (including the original deal) in white, so each successive Add alternates against the one before it.

A second, independent toggle selects **Easy** (default — plain uniform-random dealing) or **Hard** difficulty. Hard mode constructs the initial deal deliberately rather than randomly: no two structurally-adjacent cells (same row, column, diagonal, or the row-wrap join — one step apart) ever share the same value, which rules out any identical-pair "opening" anywhere on the board, and the count of adjacent pairs summing to the mode's pair target is nudged into a target range — 0–2 for Classic, Extended, and Hex (calibrated against 8 real "10000" hard-mode opening grids for Classic — 1 is typical, never above 2 — and reused as a sensible default for the two modes with no real reference to calibrate against). Octal uses a wider 2–7 instead: at only 8 possible digit values, driving all the way down to 0–2 made the search thrash badly (a median of roughly 500ms per board, some over 800ms) rather than converge — 2–7 still lands well below Octal's natural, unconstrained ~13–28 openings, but converges in single-digit milliseconds. Difficulty is orthogonal to digit mode: any of the four can be dealt Easy or Hard. Add is unaffected by difficulty in any mode — it keeps duplicating the board's exact reading-order sequence regardless, and can reintroduce identical-adjacent pairs once it's used, by design.

Under classic mode specifically, the digit that's its own complement (5, since 10−5=5) gets a deliberately larger share — not suppressed toward uniform, but targeted at roughly double it (8–9 of the 42 cells), matching what those same 8 reference grids showed exactly (5-counts of 9, 9, 9, 9, 8, 9, 8, 8 — never anything else). The reasoning: every other digit can pair two ways (another copy of itself, or its complement), but 5 only pairs with another 5, so doubling its supply keeps its pool of potential partners comparable to everyone else's rather than leaving it structurally undermatched. Getting both targets to converge reliably needed a real fix to how cells get reassigned during generation — a naive "avoid identical only" reassignment can accidentally create a new match while fixing another, and that noise made a tight target unreachable for a real (not just rare) fraction of boards; reassignment now also avoids creating any new sum-match, and searches multiple candidate cells for a safe move before ever risking one that isn't. Extended, Octal, and Hex all pair on an odd sum, so none of them has a self-complementary digit and none needs this special handling.

A **Hint** button next to Add highlights a valid pair, outlined in green, without selecting or clearing it for you. If no valid pair exists anywhere, it shows a message suggesting Add instead. Pressing Hint again — before any pair has actually been removed — rotates to the next valid pair rather than re-showing the same one, cycling back to the first once you've seen them all; a non-matching cell click doesn't reset this, only an actual match, an Add press, or a new game does (since those are the only things that can change which pairs are available).

Clearing the board doesn't end the game — it advances to **Stage** N+1, shown in a label above the board. The next stage deals a fresh board under the same mode and difficulty (no scaling between stages), lives reset to a full 5, and score carries over rather than resetting, so the run's total score is cumulative across every stage played. The advance is immediate — no confirmation screen — the moment the last cell clears. Game over (no valid move and no lives left) now reports which stage was reached alongside the final score.

Not yet implemented: persistent high score, any non-random ("cultured") distribution for the Add pool specifically (the initial deal now has two distribution strategies — uniform random for Easy, constrained for Hard), and difficulty scaling across stages (every stage currently uses the same mode/difficulty the run started with).

## Running locally

`index.html` loads `dist/bundle.min.js`, a bundled and minified build of `src/main.js` + `src/game.js` (esbuild), not the source files directly. Serve the directory with any static server, e.g.:

```
npx serve .
```

or just open `index.html` directly in a browser. `dist/bundle.min.js` is committed, so this works straight off a fresh clone with no build step required.

## Building

Source lives in `src/` (`game.js` fully commented and unit-testable, `main.js` for DOM wiring) and stays that way — only the shipped bundle is minified, never the source. After changing either file, regenerate the bundle and commit the result:

```
npm install
npm run build
```

This runs `esbuild src/main.js --bundle --minify --outfile=dist/bundle.min.js`. There's no CI build step — GitHub Pages serves `dist/bundle.min.js` exactly as committed, so a stale, un-rebuilt bundle after a source change would silently ship the old behaviour.

## Deploying

Served via GitHub Pages from the `main` branch root.

## Roadmap

1. Browser prototype (vanilla HTML/CSS/JS) — establish core game rules and feel.
2. iOS port (SwiftUI, once the Mac/Xcode situation is sorted) — carry over the validated mechanics.

## License

MIT — see [LICENSE](LICENSE).
