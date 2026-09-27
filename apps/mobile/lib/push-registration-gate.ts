export type RegistrationGate = {
  run(key: string, register: () => Promise<void>): Promise<void>;
  clear(): void;
};

// Deduplicates both React lifecycle repetition and genuinely concurrent registration
// attempts. A failed attempt is deliberately not remembered, so a later explicit retry
// can recover without reloading the app.
export function createRegistrationGate(): RegistrationGate {
  const completedKeys = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();
  let generation = 0;

  return {
    async run(key, register) {
      if (completedKeys.has(key)) return;
      const existing = inFlight.get(key);
      if (existing) return existing;

      const attemptGeneration = generation;
      const promise = register()
        .then(() => {
          if (generation === attemptGeneration) completedKeys.add(key);
        })
        .finally(() => {
          if (inFlight.get(key) === promise) inFlight.delete(key);
        });
      inFlight.set(key, promise);
      return promise;
    },
    clear() {
      generation += 1;
      completedKeys.clear();
      inFlight.clear();
    }
  };
}
