import test from "node:test";
import assert from "node:assert/strict";
import { handleSellerMenuEscape } from "../src/features/seller/sellerNavigation.js";

function keyboard(key) {
  return {
    key,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

test("Escape dismisses the open seller menu and restores toggle focus without dismissing parent navigation", () => {
  const event = keyboard("Escape");
  let open = true;
  let focused = false;
  handleSellerMenuEscape(event, open, () => { open = false; }, {
    focus: () => { focused = true; },
  });
  assert.equal(open, false);
  assert.equal(focused, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test("Escape on a closed seller menu does not intercept other navigation or move focus", () => {
  const event = keyboard("Escape");
  const unexpected = () => assert.fail("Closed menu should not close or focus anything");
  handleSellerMenuEscape(event, false, unexpected, { focus: unexpected });
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
});

test("other keys preserve seller menu interaction and native keyboard behavior", () => {
  for (const key of ["Enter", " ", "Tab", "ArrowDown"]) {
    const event = keyboard(key);
    const unexpected = () => assert.fail(`Unexpected dismissal on ${key}`);
    handleSellerMenuEscape(event, true, unexpected, { focus: unexpected });
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.propagationStopped, false);
  }
});
