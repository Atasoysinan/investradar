type DataOptions = RequestInit & { next?: { revalidate: number } };

export class DataRequestTimeout extends Error {}
export class DataRequestError extends Error {
  constructor(public status: number) { super('Data provider unavailable'); }
}

// The deadline includes headers AND JSON body reading, even if abort is ignored.
export async function fetchData(url: string, options: DataOptions = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const parent = options.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        cancel = () => { reject(new Error('Data request cancelled')); controller.abort(); };
        if (parent?.aborted) { cancel(); return; }
        parent?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => { reject(new DataRequestTimeout('Data request timed out')); controller.abort(); }, timeoutMs);
      }),
      (async () => {
        if (controller.signal.aborted) throw new Error('Data request cancelled');
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (controller.signal.aborted) throw new Error('Data request cancelled');
        if (!response.ok) throw new DataRequestError(response.status);
        return { data: await response.json(), headers: response.headers };
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}

export async function fetchJson(url: string, options: DataOptions = {}, timeoutMs = 5000) {
  return (await fetchData(url, options, timeoutMs)).data;
}

// Multi-stage routes share one budget; expired work cannot start another fetch.
export function createDataRequest(totalMs = 8000): typeof fetchJson {
  const deadline = Date.now() + totalMs;
  return async (url, options = {}, timeoutMs = 5000) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DataRequestTimeout('Data request timed out');
    return fetchJson(url, options, Math.min(timeoutMs, remaining));
  };
}
