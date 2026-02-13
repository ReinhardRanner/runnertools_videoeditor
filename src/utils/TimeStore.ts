// src/utils/TimeStore.ts
class TimeStore {
  public currentTime: number = 0;
  public isPlaying: boolean = false;
  private listeners: Set<(time: number, isPlaying: boolean) => void> = new Set();

  update(time: number, isPlaying: boolean) {
    this.currentTime = time;
    this.isPlaying = isPlaying;
    this.emit();
  }

  private emit() {
    this.listeners.forEach(cb => cb(this.currentTime, this.isPlaying));
  }

  subscribe(cb: (time: number, isPlaying: boolean) => void) {
    this.listeners.add(cb);
    // Immediate emit to sync new subscriber
    cb(this.currentTime, this.isPlaying);
    return () => this.listeners.delete(cb);
  }
}

export const timeStore = new TimeStore();