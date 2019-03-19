import PQueue, { DefaultAddOptions } from 'p-queue';
import pDefer from 'p-defer';
import pTimeout from 'p-timeout';

interface ITask<T> {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

export interface AddOptions extends DefaultAddOptions {
  timeout?: number;
  timeoutMessage?: string;
}

export class CommandQueue<T> {
  private readonly _queue: PQueue;
  current: ITask<T> | null = null;

  constructor() {
    this._queue = new PQueue({ concurrency: 1 });
  }

  add(fn: () => void, options?: AddOptions): Promise<T> {
    const opts: AddOptions = {
      timeoutMessage: 'Command timed out',
      ...options
    };

    return this._queue.add(
      () => {
        let deferred = pDefer<T>();
        this.current = {
          resolve: deferred.resolve,
          reject: deferred.reject
        };

        try {
          fn();
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
}
