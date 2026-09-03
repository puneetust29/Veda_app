import { useCallback, useRef, useState } from 'react';

import { api } from '../lib/api';

type Prediction = { place_id: string; description: string };

export function usePlacesAutocomplete() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((input: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!input.trim()) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setPredictions([]);
    debounceRef.current = setTimeout(async () => {
      try {
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const result = await api.autocompletePlaces(input);
        if (__DEV__) console.log('[usePlacesAutocomplete] Result:', result);
        setPredictions(result.predictions || []);
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          if (__DEV__) console.error('[usePlacesAutocomplete] Search failed:', err);
          setPredictions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return { predictions, loading, search };
}
