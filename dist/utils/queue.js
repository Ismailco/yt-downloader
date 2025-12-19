"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.failedDownloadQueue = exports.Worker = exports.connection = exports.downloadQueueEvents = exports.downloadQueue = void 0;
exports.createPubSubClient = createPubSubClient;
exports.getConnection = getConnection;
exports.getDownloadQueue = getDownloadQueue;
exports.getDownloadQueueEvents = getDownloadQueueEvents;
exports.getFailedDownloadQueue = getFailedDownloadQueue;
const bullmq_1 = require("bullmq");
Object.defineProperty(exports, "Worker", { enumerable: true, get: function () { return bullmq_1.Worker; } });
const redis_1 = require("redis");
function getConnection() {
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
function createPubSubClient() {
    const REDIS_URL = process.env.REDIS_URL || null;
    if (REDIS_URL) {
        return (0, redis_1.createClient)({ url: REDIS_URL });
    }
    return (0, redis_1.createClient)({
        socket: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: Number(process.env.REDIS_PORT) || 6379
        },
        password: process.env.REDIS_PASSWORD || undefined
    });
}
function getDefaultJobOptions() {
    return {
        attempts: Number(process.env.JOB_ATTEMPTS || 3),
        backoff: {
            type: (process.env.JOB_BACKOFF_TYPE || 'exponential'),
            delay: Number(process.env.JOB_BACKOFF_DELAY || 5000)
        },
        removeOnComplete: {
            age: Number(process.env.JOB_REMOVE_ON_COMPLETE_AGE || 60 * 60)
        },
        removeOnFail: false
    };
}
let _downloadQueue = null;
let _downloadQueueEvents = null;
let _failedDownloadQueue = null;
function getDownloadQueue() {
    if (!_downloadQueue) {
        _downloadQueue = new bullmq_1.Queue('download', {
            connection: getConnection(),
            defaultJobOptions: getDefaultJobOptions()
        });
    }
    return _downloadQueue;
}
function getDownloadQueueEvents() {
    if (!_downloadQueueEvents) {
        _downloadQueueEvents = new bullmq_1.QueueEvents('download', {
            connection: getConnection()
        });
    }
    return _downloadQueueEvents;
}
function getFailedDownloadQueue() {
    if (!_failedDownloadQueue) {
        _failedDownloadQueue = new bullmq_1.Queue('download-failed', {
            connection: getConnection()
        });
    }
    return _failedDownloadQueue;
}
const downloadQueue = {
    get queue() { return getDownloadQueue(); },
    add: (...args) => getDownloadQueue().add(...args),
    getJob: (...args) => getDownloadQueue().getJob(...args),
};
exports.downloadQueue = downloadQueue;
const downloadQueueEvents = {
    get events() { return getDownloadQueueEvents(); },
    on: (...args) => getDownloadQueueEvents().on(...args),
    off: (...args) => getDownloadQueueEvents().off(...args),
    removeListener: (...args) => getDownloadQueueEvents().removeListener(...args),
};
exports.downloadQueueEvents = downloadQueueEvents;
const failedDownloadQueue = {
    get queue() { return getFailedDownloadQueue(); },
    add: (...args) => getFailedDownloadQueue().add(...args),
};
exports.failedDownloadQueue = failedDownloadQueue;
const connection = {
    get config() { return getConnection(); }
};
exports.connection = connection;
