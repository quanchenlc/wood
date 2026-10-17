import { ensureHud, disposeHud, compositeHud } from "./hud";
import { isMinigame } from "./env";

export { ensureHud, disposeHud, compositeHud };

export function isMinigameRuntime(): boolean {
  return isMinigame();
}
