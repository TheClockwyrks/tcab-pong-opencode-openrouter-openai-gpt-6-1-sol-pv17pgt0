import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type CaromDebugApi, type CaromState } from "./game";
import {
  AI_SPEED,
  BALL_R,
  CAROM_DEBUG_VERSION,
  CUES,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  LAYOUT,
  MAX_BOUNCE_ANGLE,
  OBSTACLE_CENTERS,
  OBSTACLE_HW,
  OBSTACLE_SPIN_RATE,
  OBSTACLE_SWAY_AMP,
  OBSTACLE_SWAY_PERIOD,
  P1_X1,
  P2_X0,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TRAIL_TIME,
  WIN_SCORE,
} from "./constants";

const engines: Engine<CaromState, CaromDebugApi>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
  vi.restoreAllMocks();
});

async function setup(step = 10, draw = false) {
  const events = new EventTarget();
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(step),
    game: draw ? game : { ...game, render() {} },
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, down = true) =>
    events.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const tap = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    id = 1,
    device = "mouse",
  ) =>
    events.dispatchEvent(
      Object.assign(new Event(`pointer${type}`), {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: device,
        isPrimary: id === 1,
        button: 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  const d = engine.debug;
  const pose = (fn: (s: CaromState, d: CaromDebugApi) => CaromState) =>
    engine.apply((s) => fn(s, d));
  const flight = (x: number, y: number, vx: number, vy: number, spin = 0) => {
    pose((s) => d.clearWorld(s));
    pose((s) => d.spawnBall(s));
    pose((s) => d.setMode(s, "versus"));
    pose((s) => d.setScreen(s, "playing"));
    pose((s) => d.setBallHeld(s, false));
    pose((s) => d.setBallPosition(s, x, y));
    pose((s) => d.setBallVelocity(s, vx, vy));
    pose((s) => d.setBallSpin(s, spin));
  };
  const cues: string[] = [];
  engine.events.on("cue:played", ({ cue }) => cues.push(cue));
  return { engine, d, key, tap, pointer, pose, flight, cues, canvas };
}

describe("screens, input, and complete state", () => {
  it("initializes the title and reads diagnostics without changing state", async () => {
    const { engine, d } = await setup();
    const s = d.snapshot(engine.state);
    expect(s.version).toBe(CAROM_DEBUG_VERSION);
    expect(s).toMatchObject({
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      winner: null,
      receiver: "left",
      obstacleClock: 0,
      obstacleClockRunning: true,
      simTime: 0,
      muted: false,
      score: { p1: 0, p2: 0 },
    });
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      holdTimer: HOLD_TIME,
      speed: 0,
      spin: 0,
      trail: [],
    });
    expect(s.obstacles).toHaveLength(2);
    const before = engine.state;
    expect(engine.diagnostics().every((r) => r.error === undefined)).toBe(true);
    expect(engine.diagnostics()).toHaveLength(11);
    expect(engine.state).toBe(before);
    await engine.advance(5);
    expect(engine.state.simTime).toBeCloseTo(0.05);
    expect(engine.state.ball).toEqual(before.ball);
  });
  it("wraps navigation, remembers how-to selection, and gives up priority", async () => {
    const { engine, key, tap } = await setup();
    key("KeyW");
    key("KeyS");
    key("Enter");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(2);
    expect(engine.state.screen).toBe("title");
    for (const code of ["KeyW", "KeyS", "Enter"]) key(code, false);
    await tap("Enter");
    expect(engine.state.screen).toBe("howto");
    await tap("Escape");
    expect(engine.state).toMatchObject({
      screen: "title",
      titleIndex: 2,
      menuIndex: 2,
    });
    await tap("ArrowDown");
    expect(engine.state.menuIndex).toBe(0);
    await tap("ArrowDown");
    await tap("Space");
    expect(engine.state).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
  });
  it("pauses exactly once for Escape, freezes the field, and resumes the countdown", async () => {
    const { engine, tap } = await setup();
    await tap("Enter");
    await tap("Escape");
    expect(engine.state).toMatchObject({
      screen: "paused",
      resumeScreen: "countdown",
    });
    const before = engine.state;
    await engine.advance(40);
    expect(engine.state.ball).toEqual(before.ball);
    expect(engine.state.paddles).toEqual(before.paddles);
    expect(engine.state.obstacleClock).toBe(before.obstacleClock);
    expect(engine.state.simTime).toBeCloseTo(before.simTime + 0.4);
    await tap("Escape");
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.ball!.holdTimer).toBeLessThan(before.ball!.holdTimer);
  });
  it("restarts and quits from pause, preserving remembered selection and mute", async () => {
    const { engine, tap, pose, d } = await setup();
    await tap("ArrowDown");
    await tap("Enter");
    await tap("KeyP");
    await tap("ArrowDown");
    pose((s) => d.setScore(s, 7, 4));
    await tap("Enter");
    expect(engine.state).toMatchObject({
      screen: "countdown",
      mode: "versus",
      score: { p1: 0, p2: 0 },
    });
    await tap("KeyM");
    await tap("KeyP");
    await tap("ArrowUp");
    await tap("Enter");
    expect(engine.state).toMatchObject({
      screen: "title",
      titleIndex: 1,
      menuIndex: 1,
      muted: true,
    });
  });
  it("requires matching pointer press and release regions across frames", async () => {
    const { engine, pointer, d } = await setup();
    const a = d.menuItemRect(engine.state, 0)!,
      b = d.menuItemRect(engine.state, 1)!;
    pointer("move", b.x + 20, b.y + 20);
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    pointer("down", a.x + 20, a.y + 20);
    await engine.advance(1);
    pointer("up", b.x + 20, b.y + 20);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("down", b.x + 20, b.y + 20);
    await engine.advance(1);
    pointer("up", b.x + 20, b.y + 20);
    await engine.advance(1);
    expect(engine.state).toMatchObject({ screen: "countdown", mode: "versus" });
    expect(d.menuItemRect(engine.state, 0)).toBeNull();
  });
  it("accepts a same-frame touch tap and lets keyboard confirm take precedence", async () => {
    const { engine, pointer, d, key } = await setup();
    const r = d.menuItemRect(engine.state, 2)!;
    pointer("down", r.x + 20, r.y + 20, 2, "touch");
    pointer("up", r.x + 20, r.y + 20, 2, "touch");
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.mode).toBe("solo");
    expect(engine.state.screen).toBe("countdown");
    engine.apply((s) => d.reset(s));
    pointer("down", r.x + 20, r.y + 20, 2, "touch");
    await engine.advance(1);
    pointer("up", r.x + 20, r.y + 20, 2, "touch");
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
  });
});

describe("paddles, countdown, and AI", () => {
  it("moves both human paddles during countdown and clamps actual velocity", async () => {
    const { engine, pose, d, key } = await setup();
    pose((s) => d.setMode(s, "versus"));
    pose((s) => d.setScreen(s, "countdown"));
    key("KeyW");
    key("ArrowDown");
    await engine.advance(10);
    expect(engine.state.paddles.left.cy).toBeCloseTo(
      FIELD_CY - PADDLE_SPEED * 0.1,
    );
    expect(engine.state.paddles.right.cy).toBeCloseTo(
      FIELD_CY + PADDLE_SPEED * 0.1,
    );
    await engine.advance(50);
    expect(engine.state.paddles.left).toMatchObject({
      cy: PADDLE_MIN_CY,
      vy: 0,
    });
    expect(engine.state.paddles.right).toMatchObject({
      cy: PADDLE_MAX_CY,
      vy: 0,
    });
    key("KeyS");
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(0);
  });
  it("merges both key sets in Solo while the AI is independently gated", async () => {
    const { engine, key, pose, d, flight } = await setup();
    flight(850, 180, 500, 100);
    pose((s) => d.setMode(s, "solo"));
    key("ArrowUp");
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(-PADDLE_SPEED);
    expect(engine.state.paddles.right.vy).toBe(-AI_SPEED);
    pose((s) => d.setAiMovement(s, false));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
    pose((s) => d.setAiMovement(s, true));
    pose((s) => d.setAiTracking(s, false));
    pose((s) => d.setPaddleCy(s, "right", 200));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(AI_SPEED);
    pose((s) => d.setPaddleCy(s, "right", FIELD_CY));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
  });
  it("serves on timer expiry without moving, preserving the posed sign", async () => {
    const { engine, pose, d } = await setup(10);
    pose((s) => d.setScreen(s, "countdown"));
    pose((s) => d.setReceiver(s, "right"));
    pose((s) => d.setBallServeSign(s, -1));
    pose((s) => d.setBallHoldTimer(s, 0.01));
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: false,
      holdTimer: 0,
      serveSign: -1,
    });
    expect(engine.state.ball!.vx).toBeCloseTo(
      SERVE_SPEED * Math.cos(SERVE_ANGLE),
    );
    expect(engine.state.ball!.vy).toBeCloseTo(
      -SERVE_SPEED * Math.sin(SERVE_ANGLE),
    );
    await engine.advance(1);
    expect(engine.state.ball!.x).toBeGreaterThan(FIELD_CX);
  });
  it("keeps debug drive speed separate from integrated speed, overriding AI and input", async () => {
    const { engine, pose, d, key } = await setup();
    pose((s) => d.setPaddleVy(s, "left", 300));
    expect(engine.state.paddles.left.vy).toBe(0);
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setScreen(s, "countdown"));
    key("KeyW");
    await engine.advance(1);
    expect(engine.state.paddles.left).toMatchObject({
      cy: FIELD_CY + 3,
      vy: 300,
      drivenVy: 300,
    });
    pose((s) => d.setPaddleCy(s, "left", PADDLE_MAX_CY - 1));
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBeCloseTo(100);
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(0);
    expect(engine.state.paddles.left.drivenVy).toBe(300);
  });
});

describe("real sub-stepped collisions and spin", () => {
  it("reflects top and bottom walls, preserving speed and decaying spin only with time", async () => {
    const { engine, flight, cues } = await setup();
    flight(400, BALL_R + 1, 100, -700);
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBe(700);
    expect(engine.state.ball!.y).toBeGreaterThanOrEqual(BALL_R);
    expect(cues).toEqual([CUES.wallBounce]);
    flight(400, FIELD_H - BALL_R - 1, 100, 700);
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBe(-700);
  });
  it.each(["left", "right"] as const)(
    "bounces the %s paddle and increases speed",
    async (side) => {
      const { engine, flight, cues } = await setup();
      flight(
        side === "left" ? P1_X1 + BALL_R + 1 : P2_X0 - BALL_R - 1,
        FIELD_CY,
        side === "left" ? -700 : 700,
        0,
      );
      await engine.advance(1);
      expect(engine.state.ball!.vx).toBeCloseTo(
        (side === "left" ? 1 : -1) * 700 * SPEED_MULT,
      );
      expect(engine.state.ball!.vy).toBeCloseTo(0);
      expect(cues).toEqual([CUES.paddleHit]);
    },
  );
  it("sets the edge angle, caps speed, and transfers actual moving-paddle spin", async () => {
    const { engine, flight, pose, d } = await setup(2);
    flight(P1_X1 + BALL_R + 0.5, FIELD_CY + 40, -SPEED_CAP, 0);
    pose((s) => d.setPaddleVy(s, "left", 300));
    pose((s) => d.setPaddleDriven(s, "left", true));
    await engine.advance(1);
    const b = engine.state.ball!;
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(SPEED_CAP);
    expect(Math.atan2(b.vy, b.vx)).toBeCloseTo(
      ((40 - 0.6) / 55) * MAX_BOUNCE_ANGLE,
    );
    expect(b.spin).toBeCloseTo(300 * SPIN_FROM_PADDLE);
  });
  it("resolves end caps like walls without adding speed or spin", async () => {
    const { engine, flight, cues } = await setup(2);
    flight(P1_X1 - 8, FIELD_CY - 55 - BALL_R + 0.2, 0, 500);
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBe(-500);
    expect(cues).toEqual([CUES.wallBounce]);
  });
  it("reflects upright and rotated obstacle faces using their local normals", async () => {
    const { engine, flight, pose, d, cues } = await setup(2);
    flight(
      OBSTACLE_CENTERS[0].x - OBSTACLE_HW - BALL_R - 0.2,
      OBSTACLE_CENTERS[0].y,
      500,
      0,
    );
    pose((s) => d.spawnObstacle(s, 0));
    pose((s) => d.setObstacleClockRunning(s, false));
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBeCloseTo(-500);
    expect(cues).toContain(CUES.obstacleBounce);
    const t = Math.PI / 4 / OBSTACLE_SPIN_RATE;
    pose((s) => d.setObstacleClock(s, t));
    const o = engine.state.obstacles[0],
      dist = OBSTACLE_HW + BALL_R + 0.1;
    pose((s) =>
      d.setBallPosition(
        s,
        o.cx - dist * Math.cos(o.theta),
        o.cy - dist * Math.sin(o.theta),
      ),
    );
    pose((s) => d.setBallVelocity(s, 500, 0));
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBeCloseTo(0, 7);
    expect(engine.state.ball!.vy).toBeCloseTo(-500);
  });
  it("pushes an embedded ball out and resolves a corner normal without changing speed", async () => {
    const { engine, flight, pose, d } = await setup(2);
    const o = OBSTACLE_CENTERS[0];
    flight(o.x, o.y, -300, 0);
    pose((s) => d.spawnObstacle(s, 0));
    pose((s) => d.setObstacleClockRunning(s, false));
    await engine.advance(1);
    expect(Math.abs(engine.state.ball!.x - o.x)).toBeGreaterThanOrEqual(
      OBSTACLE_HW + BALL_R,
    );
    pose((s) => d.setBallPosition(s, o.x - OBSTACLE_HW - 6, o.y - 70 - 6));
    pose((s) => d.setBallVelocity(s, 300, 300));
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBeLessThan(0);
    expect(engine.state.ball!.vy).toBeLessThan(0);
    expect(
      Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy),
    ).toBeCloseTo(Math.hypot(300, 300));
  });
  it("turns clockwise for positive spin, retains speed, and records a time-bounded curved trail", async () => {
    const { engine, flight } = await setup(10);
    flight(400, 250, 500, 0, 500);
    const original = engine.state;
    await engine.advance(20);
    const b = engine.state.ball!;
    expect(b.vy).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThan(250);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(500);
    expect(b.spin).toBeCloseTo(500 * Math.pow(0.5, 0.2 / SPIN_HALFLIFE));
    expect(b.trail.length).toBeGreaterThan(8);
    expect(b.trail.every((p) => engine.state.simTime - p.t <= TRAIL_TIME)).toBe(
      true,
    );
    expect(original.ball).toMatchObject({
      x: 400,
      y: 250,
      spin: 500,
      trail: [],
    });
  });
  it("agrees across 2ms and 16ms through paddle and wall contacts and a point", async () => {
    async function scenario(step: number) {
      const { engine, flight, cues } = await setup(step);
      flight(350, FIELD_CY - 30, -800, 0, 100);
      // A spin-bearing edge return hits the top wall before missing the opponent.
      engine.apply((s) => engine.debug.setPaddleCy(s, "right", PADDLE_MIN_CY));
      let count = 0;
      let velocity = { vx: 0, vy: 0 };
      while (engine.state.score.p1 === 0 && count++ < 1500) {
        const ball = engine.state.ball!;
        velocity = { vx: ball.vx, vy: ball.vy };
        await engine.advance(1);
      }
      return {
        score: engine.state.score,
        cues,
        time: engine.state.simTime,
        velocity,
      };
    }
    const a = await scenario(2),
      b = await scenario(16);
    expect(a.score).toEqual(b.score);
    expect(a.cues).toEqual(b.cues);
    expect(a.cues).toEqual([CUES.paddleHit, CUES.wallBounce, CUES.score]);
    expect(
      Math.abs(
        Math.hypot(a.velocity.vx, a.velocity.vy) -
          Math.hypot(b.velocity.vx, b.velocity.vy),
      ),
    ).toBeLessThan(10);
    const direction = (v: number) => (Math.abs(v) < 120 ? 0 : Math.sign(v));
    expect(direction(a.velocity.vx)).toBe(direction(b.velocity.vx));
    expect(direction(a.velocity.vy)).toBe(direction(b.velocity.vy));
    expect(Math.abs(a.time - b.time) / a.time).toBeLessThan(0.08);
  });
});

describe("scoring, poses, and rendering", () => {
  it("parks toward the conceding side and requires a two-point win", async () => {
    const { engine, flight, pose, d, cues, tap } = await setup();
    flight(FIELD_W + BALL_R + 1, 200, 500, 0);
    pose((s) => d.setScore(s, WIN_SCORE - 1, WIN_SCORE - 1));
    await engine.advance(1);
    expect(engine.state).toMatchObject({
      screen: "countdown",
      receiver: "right",
      winner: null,
      score: { p1: WIN_SCORE, p2: WIN_SCORE - 1 },
    });
    expect(engine.state.ball).toMatchObject({
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    flight(FIELD_W + BALL_R + 1, 200, 500, 0);
    await engine.advance(1);
    expect(engine.state).toMatchObject({
      screen: "matchover",
      winner: "left",
      menuIndex: 0,
    });
    expect(cues.filter((c) => c === CUES.score)).toHaveLength(2);
    await tap("Enter");
    expect(engine.state).toMatchObject({
      screen: "countdown",
      winner: null,
      score: { p1: 0, p2: 0 },
    });
    flight(-BALL_R - 1, 200, -500, 0);
    pose((s) => d.setScore(s, 0, WIN_SCORE - 1));
    await engine.advance(1);
    expect(engine.state.winner).toBe("right");
    await tap("Escape");
    expect(engine.state.screen).toBe("title");
  });
  it("reconciles without advancing and fails loudly for absent entities", async () => {
    const { engine, pose, d } = await setup();
    pose((s) => d.setObstacleClock(s, OBSTACLE_SWAY_PERIOD / 4));
    expect(engine.state.obstacles[0].cy).toBeCloseTo(
      OBSTACLE_CENTERS[0].y + OBSTACLE_SWAY_AMP,
    );
    pose((s) => d.setBallPosition(s, P1_X1, FIELD_CY));
    const before = engine.state;
    pose((s) => d.reconcile(s));
    pose((s) => d.reconcile(s));
    expect(engine.state).toEqual(before);
    pose((s) => d.clearWorld(s));
    await engine.advance(1);
    expect(d.snapshot(engine.state)).toMatchObject({
      ball: null,
      obstacles: [],
    });
    expect(() => pose((s) => d.setBallPosition(s, 1, 2))).toThrow("No ball");
    expect(() => pose((s) => d.setBallVelocity(s, 1, 2))).toThrow();
    expect(() => pose((s) => d.setBallSpin(s, 1))).toThrow();
    expect(() => pose((s) => d.setBallHeld(s, true))).toThrow();
    expect(() => pose((s) => d.setBallHoldTimer(s, 1))).toThrow();
    expect(() => pose((s) => d.setBallServeSign(s, 1))).toThrow();
    expect(() => pose((s) => d.drawBallServeSign(s))).toThrow();
    expect(() => pose((s) => d.spawnObstacle(s, 2))).toThrow();
    pose((s) => d.spawnObstacle(s, 1));
    pose((s) => d.spawnObstacle(s, 0));
    expect(engine.state.obstacles.map((o) => o.index)).toEqual([0, 1]);
  });
  it("poses every independent state field and resets all but mute", async () => {
    const { engine, pose, d } = await setup();
    pose((s) => d.setMenuIndex(s, 2));
    pose((s) => d.setTitleIndex(s, 1));
    pose((s) => d.setResumeScreen(s, "countdown"));
    pose((s) => d.setWinner(s, "right"));
    pose((s) => d.setPaddleDriven(s, "right", true));
    pose((s) => d.setPaddleVy(s, "right", -100));
    pose((s) => d.setMuted(s, true));
    expect(d.snapshot(engine.state)).toMatchObject({
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      winner: "right",
      muted: true,
      paddles: { right: { driven: true, drivenVy: -100, vy: 0 } },
    });
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    pose((s) => d.drawBallServeSign(s));
    expect(engine.state.ball!.serveSign).toBe(-1);
    pose((s) => d.drawBallServeSign(s));
    expect(engine.state.ball!.serveSign).toBe(1);
    pose((s) => d.reset(s));
    expect(engine.state).toMatchObject({
      screen: "title",
      titleIndex: 0,
      simTime: 0,
      muted: true,
      paddles: { right: { driven: false, drivenVy: 0 } },
    });
    expect(d.menuItemRect(engine.state, -1)).toBeNull();
    expect(d.menuItemRect(engine.state, 3)).toBeNull();
  });
  it("emits muted collision cues and deduplicates each event type per frame", async () => {
    const { engine, flight, pose, d } = await setup(100);
    flight(300, FIELD_CY, 0, 50000);
    pose((s) => d.setMuted(s, true));
    const events: { cue: string; gain: number }[] = [];
    engine.events.on("cue:played", (e) => events.push(e));
    await engine.advance(1);
    expect(events).toEqual([
      expect.objectContaining({ cue: CUES.wallBounce, gain: 0 }),
    ]);
  });
  it("draws all six screens and captures self-contained engine replay frames", async () => {
    const { engine, pose, d, canvas, flight } = await setup(10, true);
    engine.startRecording();
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      pose((s) => d.setScreen(s, screen));
      await engine.advance(1);
    }
    flight(400, 350, 700, 100, 400);
    await engine.advance(10);
    pose((s) => d.setScreen(s, "paused"));
    await engine.advance(1);
    pose((s) => d.setWinner(s, "left"));
    pose((s) => d.setScreen(s, "matchover"));
    await engine.advance(1);
    pose((s) => d.setWinner(s, "right"));
    pose((s) => d.setMode(s, "solo"));
    await engine.advance(1);
    pose((s) => d.clearWorld(s));
    await engine.advance(1);
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(20);
    expect(
      recording.frames.every((f) => f.ops.length > 0 && !f.truncated),
    ).toBe(true);
    expect(canvas.toBuffer("image/png").length).toBeGreaterThan(10000);
  });
});
