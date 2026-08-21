import { createBoard, createHardBoard, attemptMatch, hasValidMove, findAllValidMoves, addMoreNumbers, MODES } from "./game.js";

// Must stay even: matches remove cells two at a time and each Add
// round doubles whatever remains, so an odd starting total could
// never reach zero and the board could never be fully cleared.
const INITIAL_DIGITS = 42;
const MAX_LIVES = 5;

const boardEl = document.getElementById("board");
const stageEl = document.getElementById("stage");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const restartEl = document.getElementById("restart");
const addEl = document.getElementById("add");
const hintEl = document.getElementById("hint");
const messageEl = document.getElementById("message");
const modeEl = document.getElementById("mode");
const difficultyEl = document.getElementById("difficulty");

let mode = MODES.classic;
let difficulty = "easy";

function dealBoard() {
  return difficulty === "hard"
    ? createHardBoard(INITIAL_DIGITS, mode.minDigit, mode.maxDigit, mode.pairSum)
    : createBoard(INITIAL_DIGITS, mode.minDigit, mode.maxDigit);
}

let stage = 1;
let board = dealBoard();
let score = 0;
let lives = MAX_LIVES;
let generation = 0;
let selected = null;
let hint = null;
let hintMoves = [];
let hintIndex = 0;
let noMovesMessage = false;
let gameOver = false;

function render() {
  boardEl.innerHTML = "";

  board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const cellEl = document.createElement("button");
      cellEl.className = "cell";
      cellEl.type = "button";

      if (!cell) {
        cellEl.disabled = true;
      } else {
        cellEl.textContent = cell.value;
        cellEl.disabled = gameOver;
        if (cell.gen % 2 === 1) cellEl.classList.add("cell-added");
        cellEl.addEventListener("click", () => handleCellClick(rowIndex, colIndex));
        if (selected && selected.row === rowIndex && selected.col === colIndex) {
          cellEl.classList.add("selected");
        }
        if (
          hint &&
          ((hint.a.row === rowIndex && hint.a.col === colIndex) ||
            (hint.b.row === rowIndex && hint.b.col === colIndex))
        ) {
          cellEl.classList.add("hint");
        }
      }

      boardEl.appendChild(cellEl);
    });
  });

  stageEl.textContent = `Stage ${stage}`;
  scoreEl.textContent = `Score: ${score}`;
  livesEl.textContent = `Lives: ${lives}`;
  addEl.disabled = gameOver || lives <= 0;
  modeEl.value = mode.id;
  difficultyEl.value = difficulty;

  if (gameOver) {
    messageEl.textContent = `Game over — no moves and no lives left. Reached stage ${stage}, final score: ${score}.`;
    messageEl.hidden = false;
  } else if (noMovesMessage) {
    messageEl.textContent = "No pairs available — try Add more numbers.";
    messageEl.hidden = false;
  } else {
    messageEl.hidden = true;
  }
}

// Clearing a board doesn't end the game — it advances to the next
// stage with a fresh board of the same mode/difficulty. Score carries
// over (cumulative across the run); lives reset to a full 5.
function advanceStage() {
  stage += 1;
  board = dealBoard();
  lives = MAX_LIVES;
  generation = 0;
  selected = null;
  hint = null;
  hintMoves = [];
  hintIndex = 0;
  noMovesMessage = false;
}

function checkOutcome() {
  const cellsLeft = board.flat().filter((cell) => cell).length;
  if (cellsLeft === 0) {
    advanceStage();
    return;
  }
  if (!hasValidMove(board, mode.pairSum) && lives <= 0) {
    gameOver = true;
  }
}

function handleCellClick(row, col) {
  if (gameOver) return;

  hint = null;
  noMovesMessage = false;

  if (!selected) {
    selected = { row, col };
    render();
    return;
  }

  if (selected.row === row && selected.col === col) {
    selected = null;
    render();
    return;
  }

  const distance = attemptMatch(board, selected, { row, col }, mode.pairSum);
  selected = distance === null ? { row, col } : null;
  if (distance !== null) {
    score += distance;
    hintMoves = [];
    hintIndex = 0;
    checkOutcome();
  }
  render();
}

addEl.addEventListener("click", () => {
  if (gameOver || lives <= 0) return;
  hint = null;
  hintMoves = [];
  hintIndex = 0;
  noMovesMessage = false;
  generation += 1;
  addMoreNumbers(board, generation);
  lives -= 1;
  checkOutcome();
  render();
});

hintEl.addEventListener("click", () => {
  if (gameOver) return;
  if (hintMoves.length === 0) {
    hintMoves = findAllValidMoves(board, mode.pairSum);
    hintIndex = 0;
  } else {
    hintIndex = (hintIndex + 1) % hintMoves.length;
  }
  if (hintMoves.length > 0) {
    hint = hintMoves[hintIndex];
    noMovesMessage = false;
  } else {
    hint = null;
    noMovesMessage = true;
  }
  render();
});

function newGame() {
  stage = 1;
  board = dealBoard();
  score = 0;
  lives = MAX_LIVES;
  generation = 0;
  selected = null;
  hint = null;
  hintMoves = [];
  hintIndex = 0;
  noMovesMessage = false;
  gameOver = false;
  render();
}

restartEl.addEventListener("click", newGame);

modeEl.addEventListener("change", () => {
  mode = MODES[modeEl.value];
  newGame();
});

difficultyEl.addEventListener("change", () => {
  difficulty = difficultyEl.value;
  newGame();
});

render();
