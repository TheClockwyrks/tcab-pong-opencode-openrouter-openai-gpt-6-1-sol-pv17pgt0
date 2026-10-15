import type { RenderApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { CaromState } from "./game";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_HALF,
  PADDLE_W,
  TITLE_TEXT,
  TRAIL_TIME,
  WIN_SCORE,
  WIN_LEAD,
} from "./constants";
import { menuItemRect, menuItems } from "./menus";

type State = DeepReadonly<CaromState>;
const INK = "#e8eee7",
  MUTED = "#7e939b",
  LINE = "#26383f";
const MINT = "#a9efd0",
  CORAL = "#f79886",
  AMBER = "#ecc37d";
const SANS = '"Arial", sans-serif',
  MONO = '"Courier New", monospace';
function text(
  ctx: CanvasRenderingContext2D,
  copy: string,
  x: number,
  y: number,
  size = 14,
  color = INK,
  weight = 400,
  align: CanvasTextAlign = "left",
  mono = false,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${mono ? MONO : SANS}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(copy, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x1: number,
  y1: number,
  color = LINE,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function base(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createRadialGradient(
    FIELD_CX,
    FIELD_CY,
    40,
    FIELD_CX,
    FIELD_CY,
    760,
  );
  gradient.addColorStop(0, "#12232a");
  gradient.addColorStop(1, "#0b141a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = "#1b2b32";
  for (let x = 32; x < FIELD_W; x += 32)
    for (let y = 32; y < FIELD_H; y += 32) ctx.fillRect(x, y, 1, 1);
}
function brand(ctx: CanvasRenderingContext2D, muted: boolean): void {
  round(ctx, 40, 34, 19, 19, 4, MINT);
  line(ctx, 45, 48, 54, 39, "#0b141a", 2);
  text(ctx, "CAROM / PADDLE CLUB", 70, 49, 12, INK, 700, "left", true);
  circle(ctx, 1114, 43, 3, muted ? MUTED : MINT);
  text(
    ctx,
    muted ? "M  SOUND OFF" : "M  SOUND ON",
    1238,
    48,
    11,
    MUTED,
    400,
    "right",
    true,
  );
}
function footer(
  ctx: CanvasRenderingContext2D,
  left: string,
  right: string,
): void {
  line(ctx, 40, 661, 1240, 661);
  text(ctx, left, 40, 691, 11, MUTED, 400, "left", true);
  text(ctx, right, 1240, 691, 11, MUTED, 400, "right", true);
}
function menu(s: State, ctx: CanvasRenderingContext2D): void {
  menuItems(s).forEach((item, i) => {
    const r = menuItemRect(s, i);
    if (!r) return;
    const selected = s.menuIndex === i;
    round(ctx, r.x, r.y, r.w, r.h, 5, selected ? MINT : "#14232b");
    text(
      ctx,
      `0${i + 1}`,
      r.x + 19,
      r.y + 34,
      12,
      selected ? "#3b6959" : MUTED,
      400,
      "left",
      true,
    );
    text(ctx, item, r.x + 62, r.y + 35, 17, selected ? "#102b25" : INK, 700);
    text(
      ctx,
      selected ? "↗" : "→",
      r.x + r.w - 23,
      r.y + 35,
      23,
      selected ? "#102b25" : MUTED,
      400,
      "right",
    );
  });
}
function titleArt(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  const x = 580,
    y = 145,
    w = 600,
    h = 409;
  round(ctx, x, y, w, h, 9, "#101f26");
  ctx.strokeStyle = "#30434a";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 15, y + 15, w - 30, h - 30);
  ctx.setLineDash([5, 9]);
  line(ctx, x + w / 2, y + 16, x + w / 2, y + h - 16);
  ctx.setLineDash([]);
  ctx.strokeStyle = "#253d43";
  ctx.beginPath();
  ctx.arc(880, 350, 58, 0, Math.PI * 2);
  ctx.stroke();
  round(ctx, 612, 343, 10, 77, 5, MINT);
  round(ctx, 1138, 244, 10, 77, 5, CORAL);
  for (const [cx, cy, angle] of [
    [805, 267, -0.5],
    [955, 430, -0.5],
  ]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    round(ctx, -7, -47, 14, 94, 5, AMBER);
    ctx.restore();
  }
  ctx.strokeStyle = "#a9efd025";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 7]);
  ctx.beginPath();
  ctx.moveTo(627, 381);
  ctx.bezierCurveTo(700, 374, 735, 237, 797, 266);
  ctx.bezierCurveTo(850, 291, 811, 434, 899, 400);
  ctx.stroke();
  ctx.setLineDash([]);
  const grad = ctx.createLinearGradient(854, 413, 973, 350);
  grad.addColorStop(0, "#a9efd000");
  grad.addColorStop(1, MINT);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(862, 411);
  ctx.quadraticCurveTo(910, 414, 973, 350);
  ctx.stroke();
  ctx.shadowColor = MINT;
  ctx.shadowBlur = 24;
  circle(ctx, 973, 350, BALL_R, INK);
  ctx.shadowBlur = 0;
  text(
    ctx,
    "01 / THE ANGLE IS EVERYTHING",
    596,
    588,
    11,
    MUTED,
    400,
    "left",
    true,
  );
  circle(ctx, 1121, 584, 3, MINT);
  circle(ctx, 1135, 584, 3, LINE);
  circle(ctx, 1149, 584, 3, LINE);
  ctx.restore();
}
function title(s: State, ctx: CanvasRenderingContext2D): void {
  brand(ctx, s.muted);
  text(
    ctx,
    "A GAME OF ANGLES & INSTINCT",
    112,
    160,
    12,
    MINT,
    400,
    "left",
    true,
  );
  text(ctx, TITLE_TEXT, 104, 271, 112, INK, 900);
  text(ctx, "Find your angle.", 112, 310, 23, INK, 400);
  text(ctx, "Make it a moving target.", 112, 338, 18, MUTED);
  menu(s, ctx);
  titleArt(ctx);
  text(
    ctx,
    "ONE COURT. TWO PADDLES. INFINITE ANGLES.",
    112,
    596,
    10,
    MUTED,
    400,
    "left",
    true,
  );
  footer(
    ctx,
    "W / S  OR  ↑ / ↓  SELECT     ENTER  PLAY",
    "LOCAL PLAY / NO QUARTERS REQUIRED",
  );
}
function furniture(s: State, ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.setLineDash([7, 12]);
  line(ctx, NET_X, 118, NET_X, FIELD_H - 58, "#33464c");
  ctx.setLineDash([]);
  ctx.strokeStyle = "#25383f";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 68, 0, Math.PI * 2);
  ctx.stroke();
  line(ctx, 30, 2, FIELD_W - 30, 2, "#41535a", 3);
  line(ctx, 30, FIELD_H - 2, FIELD_W - 30, FIELD_H - 2, "#41535a", 3);
  for (const o of s.obstacles) {
    ctx.save();
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.theta);
    ctx.strokeStyle = "#ecc37d19";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, OBSTACLE_H / 2 + 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = "#ecc37d60";
    ctx.shadowBlur = 18;
    round(
      ctx,
      -OBSTACLE_W / 2,
      -OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      6,
      AMBER,
    );
    ctx.shadowBlur = 0;
    circle(ctx, 0, 0, 3, "#8f713e");
    ctx.restore();
  }
  for (const [side, x, color] of [
    ["left", P1_X0, MINT],
    ["right", P2_X0, CORAL],
  ] as const) {
    const p = s.paddles[side];
    ctx.shadowColor = `${color}70`;
    ctx.shadowBlur = 22;
    round(ctx, x, p.cy - PADDLE_HALF, PADDLE_W, PADDLE_H, PADDLE_W / 2, color);
    ctx.shadowBlur = 0;
    line(ctx, x + 5, p.cy - 13, x + 5, p.cy + 13, "#ffffff60", 2);
  }
  if (s.ball) {
    const b = s.ball;
    ctx.lineCap = "round";
    for (let i = 1; i < b.trail.length; i++) {
      const a = b.trail[i - 1],
        p = b.trail[i];
      const opacity = Math.max(0, 1 - (s.simTime - p.t) / TRAIL_TIME);
      line(
        ctx,
        a.x,
        a.y,
        p.x,
        p.y,
        `rgba(200,245,224,${opacity * 0.48})`,
        BALL_R * opacity * 1.5,
      );
    }
    ctx.shadowColor = MINT;
    ctx.shadowBlur = 22;
    circle(ctx, b.x, b.y, BALL_R, INK);
    ctx.shadowBlur = 0;
    if (b.held && s.screen === "countdown") {
      ctx.strokeStyle = "#a9efd060";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        b.x,
        b.y,
        28,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.max(0, b.holdTimer / HOLD_TIME),
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}
function hud(s: State, ctx: CanvasRenderingContext2D): void {
  text(ctx, TITLE_TEXT, 40, 43, 19, INK, 900);
  text(
    ctx,
    s.mode === "solo" ? "SOLO / YOU vs CPU" : "VERSUS / LOCAL DUEL",
    40,
    64,
    10,
    MUTED,
    400,
    "left",
    true,
  );
  text(ctx, "PLAYER 01", FIELD_CX - 110, 35, 10, MINT, 400, "center", true);
  text(
    ctx,
    s.mode === "solo" ? "COMPUTER" : "PLAYER 02",
    FIELD_CX + 110,
    35,
    10,
    CORAL,
    400,
    "center",
    true,
  );
  text(
    ctx,
    String(s.score.p1).padStart(2, "0"),
    FIELD_CX - 110,
    91,
    56,
    MINT,
    700,
    "center",
    true,
  );
  text(
    ctx,
    String(s.score.p2).padStart(2, "0"),
    FIELD_CX + 110,
    91,
    56,
    CORAL,
    700,
    "center",
    true,
  );
  text(ctx, "FIRST TO", FIELD_CX, 49, 9, MUTED, 400, "center", true);
  text(ctx, String(WIN_SCORE), FIELD_CX, 73, 21, INK, 400, "center", true);
  text(ctx, "P / ESC  PAUSE", 1238, 42, 10, MUTED, 400, "right", true);
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    1238,
    63,
    10,
    MUTED,
    400,
    "right",
    true,
  );
  text(
    ctx,
    s.mode === "solo" ? "W / S  OR  ↑ / ↓" : "W / S",
    40,
    694,
    10,
    MINT,
    400,
    "left",
    true,
  );
  text(
    ctx,
    s.mode === "solo" ? "REACTIVE AI" : "↑ / ↓",
    1238,
    694,
    10,
    CORAL,
    400,
    "right",
    true,
  );
  text(
    ctx,
    s.screen === "countdown"
      ? "GET READY / SERVE INCOMING"
      : "MOVE THROUGH CONTACT TO ADD SPIN",
    FIELD_CX,
    694,
    10,
    MUTED,
    400,
    "center",
    true,
  );
}
function howto(s: State, ctx: CanvasRenderingContext2D): void {
  brand(ctx, s.muted);
  text(ctx, "THE FIELD GUIDE", 112, 143, 12, MINT, 400, "left", true);
  text(ctx, "Play the angle.", 108, 214, 64, INK, 800);
  const rows = [
    [
      "01",
      "TAKE YOUR SIDE",
      "Solo: W / S or ↑ / ↓ move your paddle.",
      "Versus: left uses W / S; right uses ↑ / ↓.",
    ],
    [
      "02",
      "PUT A LITTLE SPIN ON IT",
      "Move as you strike to curve the ball's flight.",
      "Catch the paddle's edge for a sharper return.",
    ],
    [
      "03",
      "READ THE RICOCHET",
      "The amber bars sway, turn, and bank your shots.",
      `First to ${WIN_SCORE}, win by ${WIN_LEAD}. Every rally gets faster.`,
    ],
  ];
  rows.forEach(([n, heading, a, b], i) => {
    const y = 280 + i * 98;
    text(ctx, n, 114, y, 14, MINT, 400, "left", true);
    text(ctx, heading, 162, y, 16, INK, 700);
    text(ctx, a, 162, y + 27, 16, MUTED);
    text(ctx, b, 162, y + 51, 16, MUTED);
  });
  ctx.save();
  ctx.translate(420, 100);
  ctx.scale(0.6, 0.6);
  titleArt(ctx);
  ctx.restore();
  text(
    ctx,
    "P / ESC  Pause     M  Mute",
    802,
    498,
    13,
    MUTED,
    400,
    "left",
    true,
  );
  menu(s, ctx);
  footer(
    ctx,
    "ENTER / ESC  BACK TO MENU",
    "A GOOD RETURN IS ONLY THE BEGINNING.",
  );
}
function overlay(s: State, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#071015df";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  round(ctx, 398, 158, 484, s.screen === "paused" ? 443 : 384, 12, "#102028");
  line(ctx, 446, 203, 485, 203, s.winner === "right" ? CORAL : MINT, 3);
  text(
    ctx,
    s.screen === "paused" ? "TAKE A BREATHER" : "THAT'S A MATCH",
    FIELD_CX,
    234,
    11,
    MUTED,
    400,
    "center",
    true,
  );
  text(
    ctx,
    s.screen === "paused"
      ? "Paused."
      : s.winner === "left"
        ? "Player 01 wins."
        : s.mode === "solo"
          ? "Computer wins."
          : "Player 02 wins.",
    FIELD_CX,
    296,
    s.screen === "paused" ? 54 : 40,
    INK,
    800,
    "center",
  );
  text(
    ctx,
    s.screen === "paused"
      ? "Your next angle can wait."
      : `${s.score.p1}  —  ${s.score.p2} / FINAL SCORE`,
    FIELD_CX,
    330,
    14,
    MUTED,
    400,
    "center",
    true,
  );
  menu(s, ctx);
  text(
    ctx,
    "↑ / ↓  SELECT     ENTER  CONFIRM",
    FIELD_CX,
    638,
    11,
    MUTED,
    400,
    "center",
    true,
  );
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  base(ctx);
  if (s.screen === "title") {
    title(s, ctx);
    return;
  }
  if (s.screen === "howto") {
    howto(s, ctx);
    return;
  }
  furniture(s, ctx);
  hud(s, ctx);
  if (s.screen === "countdown" && s.ball) {
    text(ctx, "READY?", FIELD_CX, FIELD_CY + 72, 13, MINT, 700, "center", true);
  }
  if (s.screen === "paused" || s.screen === "matchover") overlay(s, ctx);
}
