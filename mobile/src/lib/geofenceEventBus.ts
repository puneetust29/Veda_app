import type { GeofenceEvent } from '../types';

type Listener = (event: GeofenceEvent) => void;

const listeners = new Set<Listener>();

export const geofenceEventBus = {
  publish(event: GeofenceEvent): void {
    listeners.forEach((l) => {
      try {
        l(event);
      } catch {
        // never let a bad listener break event delivery
      }
    });
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
