/**
 * ABD Bank Manager — Async MIDI SysEx Queue
 * Rate-limited queue for bidirectional SysEx communication per hardware
 */

export interface SysExMessage {
  data: Uint8Array;
  delay: number;
  timestamp: number;
  retries: number;
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
}

export interface MidiOutputPort {
  send(data: Uint8Array): void;
}

export interface MidiSysExQueueOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  onProgress?: (remaining: number) => void;
  onComplete?: () => void;
  onError?: (error: Error, message: SysExMessage) => void;
}

export class MidiSysExQueue {
  private queue: SysExMessage[] = [];
  private processing = false;
  private readonly options: Required<MidiSysExQueueOptions>;
  private readonly output: MidiOutputPort;

  constructor(output: MidiOutputPort, options: MidiSysExQueueOptions = {}) {
    this.output = output;
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 100,
      onProgress: options.onProgress ?? (() => {}),
      onComplete: options.onComplete ?? (() => {}),
      onError: options.onError ?? (() => {})
    };
  }

  /**
   * Enqueue multiple SysEx messages with rate-limiting
   */
  async enqueue(messages: Uint8Array[], delayMs: number): Promise<void> {
    for (const msg of messages) {
      this.queue.push({
        data: msg,
        delay: delayMs,
        timestamp: Date.now(),
        retries: 0,
        resolve: () => {},
        reject: () => {}
      });
    }

    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Enqueue a single message and return a promise that resolves when sent
   */
  async send(data: Uint8Array, delayMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        data,
        delay: delayMs,
        timestamp: Date.now(),
        retries: 0,
        resolve,
        reject
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;

      try {
        this.output.send(msg.data);
        msg.resolve();

        this.options.onProgress(this.queue.length);

        // Wait for inter-message delay
        if (msg.delay > 0) {
          await this.sleep(msg.delay);
        }
      } catch (error) {
        if (msg.retries < this.options.maxRetries) {
          msg.retries++;
          // Re-queue with exponential backoff
          const backoffDelay = this.options.retryDelayMs * Math.pow(2, msg.retries);
          this.queue.unshift({ ...msg, delay: backoffDelay });
        } else {
          msg.reject(error as Error);
          this.options.onError(error as Error, msg);
        }
      }
    }

    this.processing = false;
    this.options.onComplete();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  clear(): void {
    this.queue.forEach(msg => msg.reject(new Error('Queue cleared')));
    this.queue = [];
  }
}

/**
 * Factory for creating hardware-specific queues
 */
export function createHardwareQueue(
  output: MidiOutputPort,
  hardwareLink: { interMessageDelayMs: number; dumpTimeoutMs: number },
  options: MidiSysExQueueOptions = {}
): MidiSysExQueue {
  return new MidiSysExQueue(output, {
    ...options,
    // Hardware-specific defaults can be added here
  });
}

/**
 * Hardware-specific queue configurations
 */
export const HARDWARE_QUEUE_CONFIGS = {
  'casio-cz': { interMessageDelayMs: 100, dumpTimeoutMs: 5000 },
  'roland-juno': { interMessageDelayMs: 50, dumpTimeoutMs: 3000 },
  'korg-ms2000': { interMessageDelayMs: 20, dumpTimeoutMs: 2000 },
  'behringer-dm12': { interMessageDelayMs: 10, dumpTimeoutMs: 1000 },
  'yamaha-dx7': { interMessageDelayMs: 20, dumpTimeoutMs: 2000 }
} as const;

export type HardwareModelId = keyof typeof HARDWARE_QUEUE_CONFIGS;