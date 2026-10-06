import { useEffect, useState } from "react";
export async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? "Cannot load this view");
  return result;
}
export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    data?: T;
    error?: string;
  }>({ path });
  useEffect(() => {
    if (!path) return;
    let active = true,
      pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await get<T>(path);
        if (active) setState({ path, data });
      } catch (error) {
        if (active)
          setState((old) => ({
            path,
            data: old.path === path ? old.data : undefined,
            error: String((error as Error).message),
          }));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path]);
  return state.path === path ? state : { path };
}
