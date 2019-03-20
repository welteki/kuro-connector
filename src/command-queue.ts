import PQueue, { DefaultAddOptions, Task } from 'p-queue';
import pDefer from 'p-defer';
import pTimeout from 'p-timeout';

interface ITask<ValueType> {
  /**
   * Resolves the task with a value or the result of promise.
   *
   * @param value - The value to resolve the task with.
   */
  resolve(value: ValueType | PromiseLike<ValueType>): void;

  /**
   * Reject the task with a provided reason or error.
   *
   * @param reason - The reason or error to reject the task with.
   */
  reject(reason: unknown): void;

  /**
   * Task metadata.
   */
  [propName: string]: any;
}

export interface AddOptions extends DefaultAddOptions {
  /**
   * Task timeout interval.
   *
   * @default 50
   */
  timeout?: number;

  /**
   * Task timeout message.
   *
   * @default 'Command timed out'
   */
  timeoutMessage?: string;

  /**
   * Task metadata
   */
  metadata?: {
    [propName: string]: any;
  };
}

/**
 * Sequential promise queue with deferred promise resolution.
 */
export class CommandQueue<T> {
  private readonly _queue: PQueue;
  private _current: ITask<T> | null = null;

  constructor() {
    this._queue = new PQueue({ concurrency: 1 });
  }

  /**
   * Adds task to the queue.
   *
   * @param fn - Sync or async task
   * @param options - Task options
   */
  add(fn: () => void | Promise<void>, options?: AddOptions): Promise<T> {
    const opts: AddOptions = {
      timeout: 1000,
      timeoutMessage: 'Command timed out',
      ...options
    };

    return this._queue.add(
      async () => {
        let deferred = pDefer<T>();
        this._current = {
          resolve: deferred.resolve,
          reject: deferred.reject,
          ...opts.metadata
        };

        try {
          await fn();
        } catch (err) {
          deferred.reject(err);
        }

        return opts.timeout
          ? pTimeout(deferred.promise, opts.timeout, opts.timeoutMessage)
          : deferred.promise;
      },
      { priority: opts.priority }
    );
  }

  /**
   * Current task
   */
  get current(): ITask<T> | null {
    return this._current;
  }
}
