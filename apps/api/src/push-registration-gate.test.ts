import { describe, expect, it, vi } from 'vitest';

import { createRegistrationGate } from '../../mobile/lib/push-registration-gate';

describe('push registration lifecycle', () => {
  it('does not register again when repeated renders/effects use the same user and subscription', async () => {
    const gate = createRegistrationGate();
    const register = vi.fn(async () => {});

    for (let render = 0; render < 25; render += 1) {
      await gate.run('user-1:stable-subscription', register);
    }

    expect(register).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent registration effects for the same subscription', async () => {
    const gate = createRegistrationGate();
    let release: (() => void) | undefined;
    const register = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));

    const attempts = Array.from({ length: 10 }, () => gate.run('user-1:stable-subscription', register));
    expect(register).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all(attempts);
  });

  it('registers again only when the account or subscription token changes', async () => {
    const gate = createRegistrationGate();
    const register = vi.fn(async () => {});

    await gate.run('user-1:subscription-a', register);
    await gate.run('user-1:subscription-a', register);
    await gate.run('user-1:subscription-b', register);
    await gate.run('user-2:subscription-b', register);

    expect(register).toHaveBeenCalledTimes(3);
  });

  it('allows retry after a failed registration and resets after logout cleanup', async () => {
    const gate = createRegistrationGate();
    const register = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue(undefined);

    await expect(gate.run('user-1:subscription-a', register)).rejects.toThrow('temporary failure');
    await expect(gate.run('user-1:subscription-a', register)).resolves.toBeUndefined();
    gate.clear();
    await gate.run('user-1:subscription-a', register);

    expect(register).toHaveBeenCalledTimes(3);
  });
});
