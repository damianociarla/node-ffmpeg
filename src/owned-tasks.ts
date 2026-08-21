import type { ResolvedSettings } from './types.js';

type OwnedTask<T> = (settings: ResolvedSettings) => Promise<T>;

/** Run sibling operations under one lifetime and preserve the first failure. */
export async function runOwnedTasks<T extends readonly unknown[]>(
  settings: ResolvedSettings,
  tasks: { [K in keyof T]: OwnedTask<T[K]> },
): Promise<T> {
  const controller = new AbortController();
  const signal = settings.signal
    ? AbortSignal.any([settings.signal, controller.signal])
    : controller.signal;
  const ownedSettings = { ...settings, signal };
  const promises = tasks.map((task) => Promise.resolve().then(() => task(ownedSettings)));

  try {
    return (await Promise.all(promises)) as unknown as T;
  } catch (error) {
    controller.abort();
    await Promise.allSettled(promises);
    throw error;
  }
}
