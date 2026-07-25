import {
  EMPTY,
  type CellOwner,
  type MatchState,
  type Move,
  type SkillId,
} from "./types.js";

export function idx(width: number, x: number, y: number): number {
  return y * width + x;
}

export function inBounds(
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height
  );
}

export function cloneCells(cells: CellOwner[]): CellOwner[] {
  return cells.slice();
}

function setCell(
  cells: CellOwner[],
  width: number,
  height: number,
  x: number,
  y: number,
  owner: CellOwner,
): void {
  if (!inBounds(width, height, x, y)) return;
  cells[idx(width, x, y)] = owner;
}

function getCell(
  cells: CellOwner[],
  width: number,
  height: number,
  x: number,
  y: number,
): CellOwner | undefined {
  if (!inBounds(width, height, x, y)) return undefined;
  return cells[idx(width, x, y)] ?? EMPTY;
}

/** Paint empty or enemy as self; leave own unchanged */
function paintEmptyOrEnemy(
  cells: CellOwner[],
  width: number,
  height: number,
  x: number,
  y: number,
  self: number,
): void {
  const cur = getCell(cells, width, height, x, y);
  if (cur === undefined) return;
  if (cur === EMPTY || cur !== self) {
    setCell(cells, width, height, x, y, self);
  }
}

export function applyDot(
  cells: CellOwner[],
  width: number,
  height: number,
  move: Move,
  self: number,
): CellOwner[] {
  const next = cloneCells(cells);
  paintEmptyOrEnemy(next, width, height, move.x, move.y, self);
  return next;
}

/**
 * Center must be non-empty (caller validates).
 * Own center → clear center, 4-neighbors → self.
 * Enemy center → clear center, 4-neighbors → that enemy.
 */
export function applyCross(
  cells: CellOwner[],
  width: number,
  height: number,
  move: Move,
  self: number,
): CellOwner[] {
  const next = cloneCells(cells);
  const center = getCell(next, width, height, move.x, move.y);
  if (center === undefined || center === EMPTY) {
    return next;
  }
  const armColor: number = center === self ? self : center;
  setCell(next, width, height, move.x, move.y, EMPTY);
  const arms: [number, number][] = [
    [move.x, move.y - 1],
    [move.x, move.y + 1],
    [move.x - 1, move.y],
    [move.x + 1, move.y],
  ];
  for (const [ax, ay] of arms) {
    setCell(next, width, height, ax, ay, armColor);
  }
  return next;
}

/**
 * Along row or col through anchor:
 * empty → self, enemy → empty, own unchanged.
 */
export function applyLine(
  cells: CellOwner[],
  width: number,
  height: number,
  move: Move,
  self: number,
): CellOwner[] {
  const next = cloneCells(cells);
  const axis = move.axis!;
  if (axis === "row") {
    for (let x = 0; x < width; x++) {
      applyLineCell(next, width, height, x, move.y, self);
    }
  } else {
    for (let y = 0; y < height; y++) {
      applyLineCell(next, width, height, move.x, y, self);
    }
  }
  return next;
}

function applyLineCell(
  cells: CellOwner[],
  width: number,
  height: number,
  x: number,
  y: number,
  self: number,
): void {
  const cur = getCell(cells, width, height, x, y);
  if (cur === undefined) return;
  if (cur === EMPTY) {
    setCell(cells, width, height, x, y, self);
  } else if (cur !== self) {
    setCell(cells, width, height, x, y, EMPTY);
  }
}

export function applySkill(
  cells: CellOwner[],
  width: number,
  height: number,
  move: Move,
  self: number,
): CellOwner[] {
  switch (move.skill as SkillId) {
    case "dot":
      return applyDot(cells, width, height, move, self);
    case "cross":
      return applyCross(cells, width, height, move, self);
    case "line":
      return applyLine(cells, width, height, move, self);
    default:
      return cloneCells(cells);
  }
}

export function cellAt(state: MatchState, x: number, y: number): CellOwner {
  const { width, height } = state.config;
  if (!inBounds(width, height, x, y)) return EMPTY;
  return state.cells[idx(width, x, y)] ?? EMPTY;
}
