import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

type Prediction = { place_id: string; description: string };

export function usePlacesAutocomplete() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

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
    debounceRef.current = setTimeout(async () => {
      try {
        if (__DEV__) console.log('[usePlacesAutocomplete] Searching for:', input);
        const result = await api.autocompletePlaces(input);
        if (__DEV__) console.log('[usePlacesAutocomplete] Result:', result);
        if (isMountedRef.current) {
          setPredictions(result.predictions || []);
        }
      } catch (err) {
        if (__DEV__) console.error('[usePlacesAutocomplete] Search failed:', err);
        if (isMountedRef.current) {
          setPredictions([]);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }, 300);
  }, []);

  return { predictions, loading, search };
}
