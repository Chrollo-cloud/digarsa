// Safari can blur a focused menu item to body between pointerdown and click.
// Keep internal pointer activations mounted until their native click completes.
export function createMenuInteraction({ contains, dismiss }) {
  let pointerInside = false;
  return {
    pointerDown(target) {
      pointerInside = contains(target);
      if (!pointerInside) dismiss();
    },
    pointerEnd() { pointerInside = false; },
    escape(event, restoreFocus) {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      restoreFocus();
      return true;
    },
    blur(target) {
      if (!pointerInside && !contains(target)) dismiss();
    },
  };
}
