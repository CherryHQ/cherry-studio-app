export type ScreenAwakeLease = { release(): void };

export type ScreenAwakePort = { acquire(tag: string): ScreenAwakeLease };
