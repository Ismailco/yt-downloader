import { Queue, QueueEvents, Worker, ConnectionOptions } from 'bullmq';
import { createClient, RedisClientType } from 'redis';

interface HostConnection {
  host: string;
  port: number;
  password?: string;
}

interface UrlConnection {
  url: string;
}

type RedisConnection = HostConnection | UrlConnection;

function getConnection(): RedisConnection {
  const REDIS_URL = process.env.REDIS_URL || null;
  if (REDIS_URL) {
    return { url: REDIS_URL };
  }
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };
}

function createPubSubClient(): RedisClientType {
  const REDIS_URL = process.env.REDIS_URL || null;
  if (REDIS_URL) {
    return createClient({ url: REDIS_URL }) as RedisClientType;
  }
  return createClient({
    socket: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379
    },
    password: process.env.REDIS_PASSWORD || undefined
  }) as RedisClientType;
}

function getDefaultJobOptions() {
  return {
    attempts: Number(process.env.JOB_ATTEMPTS || 3),
    backoff: {
      type: (process.env.JOB_BACKOFF_TYPE || 'exponential') as 'exponential' | 'fixed',
      delay: Number(process.env.JOB_BACKOFF_DELAY || 5000)
    },
    removeOnComplete: {
      age: Number(process.env.JOB_REMOVE_ON_COMPLETE_AGE || 60 * 60)
    },
    removeOnFail: false
  };
}

// Lazy initialization - queues are only created when first accessed
let _downloadQueue: Queue | null = null;
let _downloadQueueEvents: QueueEvents | null = null;
let _failedDownloadQueue: Queue | null = null;

function getDownloadQueue(): Queue {
  if (!_downloadQueue) {
    _downloadQueue = new Queue('download', {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: getDefaultJobOptions()
    });
  }
  return _downloadQueue;
}

function getDownloadQueueEvents(): QueueEvents {
  if (!_downloadQueueEvents) {
    _downloadQueueEvents = new QueueEvents('download', {
      connection: getConnection() as ConnectionOptions
    });
  }
  return _downloadQueueEvents;
}

function getFailedDownloadQueue(): Queue {
  if (!_failedDownloadQueue) {
    _failedDownloadQueue = new Queue('download-failed', {
      connection: getConnection() as ConnectionOptions
    });
  }
  return _failedDownloadQueue;
}

// Export getters as properties for backward compatibility
const downloadQueue = {
  get queue() { return getDownloadQueue(); },
  add: (...args: Parameters<Queue['add']>) => getDownloadQueue().add(...args),
  getJob: (...args: Parameters<Queue['getJob']>) => getDownloadQueue().getJob(...args),
};

const downloadQueueEvents = {
  get events() { return getDownloadQueueEvents(); },
  on: (...args: Parameters<QueueEvents['on']>) => getDownloadQueueEvents().on(...args),
  off: (...args: Parameters<QueueEvents['off']>) => getDownloadQueueEvents().off(...args),
  removeListener: (...args: Parameters<QueueEvents['removeListener']>) => getDownloadQueueEvents().removeListener(...args),
};

const failedDownloadQueue = {
  get queue() { return getFailedDownloadQueue(); },
  add: (...args: Parameters<Queue['add']>) => getFailedDownloadQueue().add(...args),
};

// Export connection as a getter to avoid evaluation at module load
const connection = {
  get config() { return getConnection(); }
};

export {
  downloadQueue,
  downloadQueueEvents,
  connection,
  Worker,
  createPubSubClient,
  failedDownloadQueue,
  getConnection,
  getDownloadQueue,
  getDownloadQueueEvents,
  getFailedDownloadQueue
};
