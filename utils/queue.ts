import { Queue, QueueEvents, Worker, ConnectionOptions } from 'bullmq';
import { createClient, RedisClientType } from 'redis';

const REDIS_URL = process.env.REDIS_URL || null;

interface HostConnection {
  host: string;
  port: number;
  password?: string;
}

interface UrlConnection {
  url: string;
}

type RedisConnection = HostConnection | UrlConnection;

let connection: RedisConnection;
if (REDIS_URL) {
  connection = {
    url: REDIS_URL
  };
} else {
  connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };
}

function createPubSubClient(): RedisClientType {
  if (REDIS_URL) {
    return createClient({ url: REDIS_URL }) as RedisClientType;
  }
  const hostConn = connection as HostConnection;
  return createClient({
    socket: {
      host: hostConn.host,
      port: hostConn.port
    },
    password: hostConn.password
  }) as RedisClientType;
}

const defaultJobOptions = {
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

const downloadQueue = new Queue('download', {
  connection: connection as ConnectionOptions,
  defaultJobOptions
});
const downloadQueueEvents = new QueueEvents('download', { connection: connection as ConnectionOptions });
const failedDownloadQueue = new Queue('download:failed', { connection: connection as ConnectionOptions });

export {
  downloadQueue,
  downloadQueueEvents,
  connection,
  Worker,
  createPubSubClient,
  failedDownloadQueue
};
