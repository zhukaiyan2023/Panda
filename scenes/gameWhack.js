// Backward-compatible entry point for the Whack-a-Mole scene.
// The implementation lives in gameWhackChild.js so the old timing/layout
// state machine cannot leak back into the new child-friendly game.
export { default } from "./gameWhackChild.js?v=20260816";
