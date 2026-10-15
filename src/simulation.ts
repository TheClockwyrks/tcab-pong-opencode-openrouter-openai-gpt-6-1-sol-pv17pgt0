import type { DeepReadonly } from "ts-essentials";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  Side,
} from "./game";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  CUES,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLE_CENTERS,
  OBSTACLE_HH,
  OBSTACLE_HW,
  OBSTACLE_SPIN_RATE,
  OBSTACLE_SWAY_AMP,
  OBSTACLE_SWAY_PERIOD,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
  type ActionName,
} from "./constants";

type State = DeepReadonly<CaromState>;
export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));
export const drawSign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1);
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawSign(),
    trail: [],
  };
}
export function obstaclePose(index: number, t: number): ObstacleState {
  const base = OBSTACLE_CENTERS[index];
  if (!base || !Number.isInteger(index))
    throw new RangeError(`No obstacle ${index}`);
  return {
    index,
    cx: base.x,
    cy:
      base.y +
      (index === 0 ? 1 : -1) *
        OBSTACLE_SWAY_AMP *
        Math.sin((2 * Math.PI * t) / OBSTACLE_SWAY_PERIOD),
    theta: OBSTACLE_SPIN_RATE * t,
  };
}
export function initialState(muted: boolean): CaromState {
  const paddle = (): PaddleState => ({
    cy: FIELD_CY,
    vy: 0,
    driven: false,
    drivenVy: 0,
  });
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: paddle(), right: paddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: OBSTACLE_CENTERS.map((_, i) => obstaclePose(i, 0)),
    obstacleClock: 0,
    obstacleClockRunning: true,
    simTime: 0,
    muted,
  };
}
export function startMatch(s: State, mode: Mode): CaromState {
  return {
    ...s,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...s.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...s.paddles.right, cy: FIELD_CY, vy: 0 },
    },
    obstacleClock: 0,
    obstacleClockRunning: true,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, 0)),
    menuPresses: [],
  };
}
export function returnTitle(s: State): CaromState {
  const fresh = initialState(s.muted);
  return {
    ...fresh,
    titleIndex: s.titleIndex,
    menuIndex: s.titleIndex,
    simTime: s.simTime,
    paddles: {
      left: {
        ...fresh.paddles.left,
        driven: s.paddles.left.driven,
        drivenVy: s.paddles.left.drivenVy,
      },
      right: {
        ...fresh.paddles.right,
        driven: s.paddles.right.driven,
        drivenVy: s.paddles.right.drivenVy,
      },
    },
  };
}
function movePaddle(p: PaddleState, velocity: number, dt: number): PaddleState {
  const raw = p.cy + velocity * dt;
  const cy = clamp(raw, PADDLE_MIN_CY, PADDLE_MAX_CY);
  return { ...p, cy, vy: raw !== cy && dt > 0 ? (cy - p.cy) / dt : velocity };
}
function movePaddles(
  s: State,
  values: Record<ActionName, number>,
  dt: number,
): CaromState["paddles"] {
  const axis = (up: number, down: number): number =>
    Number(down > 0) - Number(up > 0);
  const leftVy =
    s.mode === "solo"
      ? axis(
          values["p1-up"] || values["p2-up"],
          values["p1-down"] || values["p2-down"],
        ) * PADDLE_SPEED
      : axis(values["p1-up"], values["p1-down"]) * PADDLE_SPEED;
  let rightVy = axis(values["p2-up"], values["p2-down"]) * PADDLE_SPEED;
  if (s.mode === "solo") {
    const defending =
      s.ai.tracking &&
      s.screen === "playing" &&
      s.ball !== null &&
      s.ball.vx > 0;
    const target =
      defending && s.ball ? s.ball.y - s.ball.vy * AI_REACT : AI_HOME_Y;
    const diff = target - s.paddles.right.cy;
    const deadzone = defending ? AI_DEADZONE : AI_HOME_DEADZONE;
    rightVy =
      s.ai.movement && Math.abs(diff) > deadzone && dt > 0
        ? Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt)
        : 0;
  }
  return {
    left: movePaddle(
      s.paddles.left,
      s.paddles.left.driven ? s.paddles.left.drivenVy : leftVy,
      dt,
    ),
    right: movePaddle(
      s.paddles.right,
      s.paddles.right.driven ? s.paddles.right.drivenVy : rightVy,
      dt,
    ),
  };
}

/** Mutable, frame-local working copy; never aliases the engine's value. */
type FlyingBall = { -readonly [K in keyof BallState]: BallState[K] };
function paddleCollision(
  b: FlyingBall,
  p: PaddleState,
  side: Side,
  cues: Set<string>,
): void {
  const x0 = side === "left" ? P1_X0 : P2_X0;
  const x1 = side === "left" ? P1_X1 : P2_X1;
  const y0 = p.cy - PADDLE_HALF,
    y1 = p.cy + PADDLE_HALF;
  if (
    b.x <= x0 - BALL_R ||
    b.x >= x1 + BALL_R ||
    b.y <= y0 - BALL_R ||
    b.y >= y1 + BALL_R
  )
    return;
  const depths = [
    b.x - (x0 - BALL_R),
    x1 + BALL_R - b.x,
    b.y - (y0 - BALL_R),
    y1 + BALL_R - b.y,
  ];
  const face = depths.indexOf(Math.min(...depths));
  if (face >= 2) {
    b.y = face === 2 ? y0 - BALL_R : y1 + BALL_R;
    if ((face === 2 && b.vy > 0) || (face === 3 && b.vy < 0)) {
      b.vy = -b.vy;
      cues.add(CUES.wallBounce);
    }
    return;
  }
  b.x = face === 0 ? x0 - BALL_R : x1 + BALL_R;
  if (!((face === 0 && b.vx > 0) || (face === 1 && b.vx < 0))) return;
  const theta = clamp((b.y - p.cy) / PADDLE_HALF, -1, 1) * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(b.vx, b.vy) * SPEED_MULT, SPEED_CAP);
  b.vx = (side === "left" ? 1 : -1) * speed * Math.cos(theta);
  b.vy = speed * Math.sin(theta);
  b.spin = clamp(b.spin + p.vy * SPIN_FROM_PADDLE, -SPIN_CLAMP, SPIN_CLAMP);
  b.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
  cues.add(CUES.paddleHit);
}
function obstacleCollision(
  b: FlyingBall,
  o: ObstacleState,
  cues: Set<string>,
): void {
  const c = Math.cos(o.theta),
    s = Math.sin(o.theta);
  const dx = b.x - o.cx,
    dy = b.y - o.cy;
  const lx = dx * c + dy * s,
    ly = -dx * s + dy * c;
  const qx = clamp(lx, -OBSTACLE_HW, OBSTACLE_HW),
    qy = clamp(ly, -OBSTACLE_HH, OBSTACLE_HH);
  const distance = Math.hypot(lx - qx, ly - qy);
  if (distance >= BALL_R) return;
  let nx: number, ny: number, penetration: number;
  if (distance > 0) {
    nx = (lx - qx) / distance;
    ny = (ly - qy) / distance;
    penetration = BALL_R - distance;
  } else if (OBSTACLE_HW - Math.abs(lx) <= OBSTACLE_HH - Math.abs(ly)) {
    nx = lx < 0 ? -1 : 1;
    ny = 0;
    penetration = OBSTACLE_HW - Math.abs(lx) + BALL_R;
  } else {
    nx = 0;
    ny = ly < 0 ? -1 : 1;
    penetration = OBSTACLE_HH - Math.abs(ly) + BALL_R;
  }
  const wx = nx * c - ny * s,
    wy = nx * s + ny * c;
  const dot = b.vx * wx + b.vy * wy;
  if (dot < 0) {
    b.vx -= 2 * dot * wx;
    b.vy -= 2 * dot * wy;
    cues.add(CUES.obstacleBounce);
  }
  b.x += wx * penetration;
  b.y += wy * penetration;
}
function fly(
  ball: BallState,
  s: State,
  dt: number,
  cues: Set<string>,
): BallState {
  const b: FlyingBall = { ...ball };
  const n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / MAX_SUBSTEP));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const angle = (b.spin / speed) * h;
      const c = Math.cos(angle),
        sn = Math.sin(angle),
        vx = b.vx;
      b.vx = vx * c - b.vy * sn;
      b.vy = vx * sn + b.vy * c;
    }
    b.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.y - BALL_R < 0 && b.vy < 0) {
      b.y = BALL_R;
      b.vy = -b.vy;
      cues.add(CUES.wallBounce);
    } else if (b.y + BALL_R > FIELD_H && b.vy > 0) {
      b.y = FIELD_H - BALL_R;
      b.vy = -b.vy;
      cues.add(CUES.wallBounce);
    }
    paddleCollision(b, s.paddles.left, "left", cues);
    paddleCollision(b, s.paddles.right, "right", cues);
    for (const obstacle of s.obstacles) obstacleCollision(b, obstacle, cues);
  }
  return b;
}
export function advanceWorld(
  s: State,
  values: Record<ActionName, number>,
  dt: number,
  cues: Set<string>,
): CaromState {
  let next: CaromState = { ...s, paddles: movePaddles(s, values, dt) };
  let ball = next.ball;
  if (ball && s.screen === "countdown") {
    const holdTimer = ball.holdTimer - dt;
    ball = { ...ball, x: FIELD_CX, y: FIELD_CY, holdTimer };
    if (holdTimer <= 0) {
      ball = {
        ...ball,
        holdTimer: 0,
        held: false,
        trail: [],
        vx:
          (s.receiver === "left" ? -1 : 1) *
          SERVE_SPEED *
          Math.cos(SERVE_ANGLE),
        vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
      };
      next = { ...next, screen: "playing" };
    }
  } else if (ball && !ball.held) ball = fly(ball, next, dt, cues);
  if (ball)
    ball = {
      ...ball,
      trail: [
        ...ball.trail.filter((p) => s.simTime - p.t <= TRAIL_TIME),
        { x: ball.x, y: ball.y, t: s.simTime },
      ],
    };
  const obstacleClock = s.obstacleClock + (s.obstacleClockRunning ? dt : 0);
  next = {
    ...next,
    ball,
    obstacleClock,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, obstacleClock)),
  };
  if (
    ball &&
    !ball.held &&
    s.screen === "playing" &&
    (ball.x - BALL_R > FIELD_W || ball.x + BALL_R < 0)
  ) {
    const scorer: Side = ball.x > FIELD_W ? "left" : "right";
    const score = {
      p1: s.score.p1 + Number(scorer === "left"),
      p2: s.score.p2 + Number(scorer === "right"),
    };
    const wins =
      scorer === "left"
        ? score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD
        : score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD;
    cues.add(CUES.score);
    next = wins
      ? { ...next, score, winner: scorer, screen: "matchover", menuIndex: 0 }
      : {
          ...next,
          score,
          receiver: scorer === "left" ? "right" : "left",
          ball: parkedBall(),
          screen: "countdown",
        };
  }
  return next;
}
