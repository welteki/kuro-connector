import PQueue from 'p-queue';
import pDefer from 'p-defer';

interface ITask<T> {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

export class CommandQueue<T> {
  private _queue: PQueue;
  current: ITask<T> | null = null;

  constructor() {
    this._queue = new PQueue({ concurrency: 1 });
  }

  add(fn: () => void): Promise<T> {
    return this._queue.add(() => {
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

      return deferred.promise;
    });
  }
}
