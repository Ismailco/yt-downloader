declare module 'simple-rate-limiter' {
  interface LimitedFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T>;
    to(count: number): LimitedFunction<T>;
    per(time: number): LimitedFunction<T>;
    evenly(toggle?: boolean): LimitedFunction<T>;
    withFuzz(percent?: number): LimitedFunction<T>;
    maxQueueLength(max: number): LimitedFunction<T>;
  }

  interface Limit {
    <T extends (...args: any[]) => any>(fn: T, ctx?: any): LimitedFunction<T>;
    promise<T extends (...args: any[]) => Promise<any>>(promiser: T, ctx?: any): LimitedFunction<T>;
  }

  const limit: Limit;
  export = limit;
}
