import { useSyncExternalStore } from "react";

const TOUCH_QUERY = "(any-pointer: coarse), (hover: none)";

function hasTouchInput() {
  return typeof window !== "undefined" && (
    window.navigator.maxTouchPoints > 0 || window.matchMedia(TOUCH_QUERY).matches
  );
}

function subscribeTouchInput(onChange) {
  const media = window.matchMedia(TOUCH_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const serverTouchSnapshot = () => false;

export default function useTouchInput() {
  return useSyncExternalStore(subscribeTouchInput, hasTouchInput, serverTouchSnapshot);
}
