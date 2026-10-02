import { useEffect, useRef, useState } from "react";
import type { Sample } from "../../core/src/index";
import { request, useResearch } from "./state";

export function useMeasurements(ids: string[], initial: Sample[]) {
  const { snapshot } = useResearch();
  const key = [...ids].sort().join(",");
  const [loaded, setLoaded] = useState<{ key: string; samples: Sample[] }>();
  const [error, setError] = useState("");
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    let busy = false;
    let pending = false;
    const samples: Sample[] = [];
    const cursors = new Map<string, number>();
    async function load() {
      pending = true;
      if (busy) return;
      busy = true;
      try {
        while (pending && active) {
          pending = false;
          for (const id of key.split(",").filter(Boolean)) {
            while (active) {
              const page = await request<{ samples: Sample[] }>(
                `/api/samples?record=${encodeURIComponent(id)}&after=${cursors.get(id) ?? 0}`,
              );
              samples.push(...page.samples);
              if (page.samples.length) cursors.set(id, page.samples.at(-1)!.id);
              if (page.samples.length < 1000) break;
            }
          }
          if (active) {
            setLoaded({ key, samples: [...samples] });
            setError("");
          }
        }
      } catch (failure) {
        if (active) setError(String(failure));
      } finally {
        busy = false;
      }
    }
    refresh.current = () => {
      void load();
    };
    void load();
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    refresh.current();
  }, [key, snapshot?.cursor]);
  return {
    samples: loaded?.key === key ? loaded.samples : initial,
    error,
    retry: () => refresh.current(),
  };
}
