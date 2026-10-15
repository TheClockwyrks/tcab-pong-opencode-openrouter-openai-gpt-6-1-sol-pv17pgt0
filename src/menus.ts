import type {
  UpdateApi,
  PointerSample,
  PointerContact,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { CaromState, MenuRect } from "./game";
import {
  ACTIONS,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
  type ActionName,
} from "./constants";
import { returnTitle, startMatch } from "./simulation";

type State = DeepReadonly<CaromState>;
export interface Controls {
  readonly edges: Record<ActionName, boolean>;
  readonly values: Record<ActionName, number>;
  readonly samples: readonly PointerSample[];
  readonly contacts: readonly PointerContact[];
}
export function readControls(input: UpdateApi["input"]): Controls {
  return {
    edges: Object.fromEntries(
      ACTIONS.map((a) => [a, input.pressed(a)]),
    ) as Record<ActionName, boolean>,
    values: Object.fromEntries(
      ACTIONS.map((a) => [a, input.value(a)]),
    ) as Record<ActionName, number>,
    samples: input.pointerSamples(),
    contacts: input.pointerContacts(),
  };
}
export function menuItems(s: State): readonly string[] {
  switch (s.screen) {
    case "title":
      return TITLE_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "howto":
      return ["BACK TO MENU"];
    default:
      return [];
  }
}
export function menuItemRect(s: State, index: number): MenuRect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  if (s.screen === "title")
    return { x: 112, y: 358 + index * 67, w: 388, h: 55 };
  if (s.screen === "howto") return { x: 112, y: 581, w: 388, h: 55 };
  return { x: 446, y: 367 + index * 65, w: 388, h: 54 };
}
function hit(s: State, x: number, y: number): number | null {
  const items = menuItems(s);
  for (let i = 0; i < items.length; i++) {
    const r = menuItemRect(s, i);
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return null;
}
function confirm(s: State): CaromState {
  switch (s.screen) {
    case "title": {
      const next = { ...s, titleIndex: s.menuIndex };
      return s.menuIndex === 2
        ? { ...next, screen: "howto", menuIndex: 0 }
        : startMatch(next, s.menuIndex === 0 ? "solo" : "versus");
    }
    case "howto":
      return returnTitle(s);
    case "paused":
      return s.menuIndex === 0
        ? { ...s, screen: s.resumeScreen }
        : s.menuIndex === 1
          ? startMatch(s, s.mode)
          : returnTitle(s);
    case "matchover":
      return s.menuIndex === 0 ? startMatch(s, s.mode) : returnTitle(s);
    default:
      return s;
  }
}
export function handleMenus(s: State, c: Controls): CaromState {
  const e = c.edges;
  if (s.screen === "playing" || s.screen === "countdown") {
    return e.pause
      ? {
          ...s,
          resumeScreen: s.screen,
          screen: "paused",
          menuIndex: 0,
          menuPresses: [],
        }
      : s;
  }
  if (s.screen === "paused" && (e.pause || e.back))
    return { ...s, screen: s.resumeScreen, menuPresses: [] };
  if ((s.screen === "howto" || s.screen === "matchover") && e.back)
    return returnTitle(s);
  let next: CaromState = s;
  const count = menuItems(s).length;
  const up = e["p1-up"] || e["p2-up"],
    down = e["p1-down"] || e["p2-down"];
  const movement = s.screen !== "howto" && (up || down);
  if (movement)
    next = {
      ...next,
      menuIndex: (s.menuIndex + (up ? -1 : 1) + count) % count,
    };
  // Keyboard confirmation takes priority over all pointer selection on this frame.
  if (!movement && e.confirm) return { ...confirm(next), menuPresses: [] };
  let presses = [...(s.menuPresses ?? [])];
  let pointerConfirm = false;
  for (const sample of c.samples) {
    if (sample.device !== "touch" && !sample.primary) continue;
    const index = hit(s, sample.x, sample.y);
    if (index !== null) next = { ...next, menuIndex: index };
    if (sample.type === "down" && sample.button === "primary") {
      presses = [
        ...presses.filter((p) => p.id !== sample.id),
        { id: sample.id, index },
      ];
    } else if (sample.type === "up") {
      if (
        index !== null &&
        presses.some((p) => p.id === sample.id && p.index === index)
      )
        pointerConfirm = true;
      presses = presses.filter((p) => p.id !== sample.id);
    }
  }
  for (const contact of c.contacts) {
    if (contact.device !== "touch") continue;
    const index = hit(s, contact.x, contact.y);
    if (index !== null) next = { ...next, menuIndex: index };
  }
  next = { ...next, menuPresses: presses };
  return pointerConfirm ? { ...confirm(next), menuPresses: [] } : next;
}
