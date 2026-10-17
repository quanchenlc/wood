import { ensureHud, disposeHud } from "./hud";
import { isMinigame } from "./env";

export { ensureHud, disposeHud };

export function isMinigameRuntime(): boolean {
  return isMinigame();
}
