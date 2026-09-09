import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * A minimal always-mounted portal for React Native (which has no
 * ReactDOM.createPortal equivalent). Render <OverlayHost /> once near the
 * app root; anything pushed via setOverlayContent renders there instead of
 * wherever the calling component happens to be nested.
 *
 * Why this exists: CheckoutWebView needs to render full-screen (escaping a
 * chat card's clipping) when visible, and near-invisible-but-still-running
 * when "minimized". Conditionally swapping between <Modal> and a plain
 * <View> for those two states makes React unmount+remount the whole
 * subtree (different element types at the same tree position) — which
 * reloads the WebView from scratch and can corrupt an in-progress checkout.
 * Pushing a stable element shape into one persistent slot avoids that: only
 * style props change, so the WebView instance is never destroyed.
 */

type Listener = () => void;

let currentNode: ReactNode = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setOverlayContent(node: ReactNode) {
  currentNode = node;
  emit();
}

export function clearOverlayContent() {
  currentNode = null;
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentNode;
}

export function OverlayHost() {
  const node = useSyncExternalStore(subscribe, getSnapshot);
  if (!node) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {node}
    </View>
  );
}
