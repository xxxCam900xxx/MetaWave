interface FadeSound {
  getStatusAsync(): Promise<{ isLoaded: false } | { isLoaded: true; volume: number }>;
  setVolumeAsync(volume: number): Promise<unknown>;
  playAsync(): Promise<unknown>;
  pauseAsync(): Promise<unknown>;
  unloadAsync(): Promise<unknown>;
}

export async function fadeMusicForSpeaker(
  sound: Pick<FadeSound, "setVolumeAsync">,
  targetVolume: () => number,
  shouldContinue: () => boolean,
  stillCurrent: () => boolean,
  duration: number,
): Promise<void> {
  const started = Date.now();
  try {
    while (shouldContinue()) {
      const progress = Math.min(1, (Date.now() - started) / duration);
      await sound.setVolumeAsync(targetVolume() * (1 - progress));
      if (progress >= 1) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    if (stillCurrent() && !shouldContinue()) await sound.setVolumeAsync(targetVolume());
  }
}

export async function fadeSpeakerTransition(
  previous: FadeSound,
  next: FadeSound,
  targetVolume: () => number,
  shouldContinue: () => boolean,
): Promise<void> {
  try {
    const status = await previous.getStatusAsync();
    const previousVolume = status.isLoaded ? status.volume : 0;
    if (!shouldContinue()) {
      await next.setVolumeAsync(targetVolume());
      return;
    }
    await next.playAsync();
    for (let step = 1; step <= 10; step++) {
      if (!shouldContinue()) {
        await next.pauseAsync();
        await next.setVolumeAsync(targetVolume());
        return;
      }
      await Promise.all([
        previous.setVolumeAsync(previousVolume * (1 - step / 10)),
        next.setVolumeAsync(targetVolume() * step / 10),
      ]);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    await previous.unloadAsync();
  }
}
