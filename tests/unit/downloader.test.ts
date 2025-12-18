const { EventEmitter } = require('events');

jest.mock('youtube-dl-exec', () => {
  const fn = jest.fn();
  fn.exec = jest.fn();
  return fn;
});

jest.mock('fluent-ffmpeg', () => {
  return jest.fn(() => {
    const chain = {
      noVideo: jest.fn(() => chain),
      audioCodec: jest.fn(() => chain),
      audioBitrate: jest.fn(() => chain),
      format: jest.fn(() => chain),
      on: jest.fn((event, handler) => {
        if (event === 'end') chain._onEnd = handler;
        if (event === 'error') chain._onError = handler;
        return chain;
      }),
      save: jest.fn(() => {
        setImmediate(() => {
          if (chain._onEnd) chain._onEnd();
        });
        return chain;
      })
    };
    return chain;
  });
});

jest.mock('fs-extra', () => ({
  ensureDir: jest.fn(() => Promise.resolve()),
  ensureDirSync: jest.fn(),
  remove: jest.fn(() => Promise.resolve()),
  move: jest.fn(() => Promise.resolve())
}));

jest.mock('ytpl', () => ({
  __esModule: true,
  default: jest.fn()
}));

const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const ytpl = require('ytpl').default;

const { downloadVideo, downloadPlaylist } = require('../../lib/downloader');

const createDownloadProcess = (destinationPath) => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const promise = new Promise((resolve) => {
    setImmediate(() => {
      stdout.emit('data', Buffer.from('50%'));
      stdout.emit('data', Buffer.from(`Destination: ${destinationPath}`));
      resolve();
    });
  });
  promise.stdout = stdout;
  promise.stderr = stderr;
  return promise;
};

beforeEach(() => {
  jest.clearAllMocks();
  let call = 0;
  youtubedl.exec.mockImplementation((url, options) => {
    call += 1;
    const template = (options && options.output) || `/tmp/output${call}.%(ext)s`;
    const destinationPath = template
      .replace('%(title)s', `sample_${call}`)
      .replace('%(ext)s', 'm4a');
    return createDownloadProcess(destinationPath);
  });
});

describe('downloader library', () => {
  it('converts video downloads to mp3 when requested', async () => {
    const progressSpy = jest.fn();
    const result = await downloadVideo(
      'https://youtu.be/example',
      '/tmp/output',
      progressSpy,
      { format: 'mp3' }
    );

    expect(result.format).toBe('mp3');
    expect(result.filePath.endsWith('.mp3')).toBe(true);
    expect(progressSpy).toHaveBeenCalled();
    expect(ffmpeg).toHaveBeenCalled();
  });

  it('limits playlist downloads to selected video IDs', async () => {
    ytpl.mockResolvedValue({
      title: 'Test Playlist',
      items: [
        { id: 'first', title: 'First video' },
        { id: 'second', title: 'Second video' }
      ]
    });

    const result = await downloadPlaylist(
      'https://www.youtube.com/playlist?list=test',
      '/tmp/out',
      jest.fn(),
      {
        selectedVideoIds: ['second'],
        format: 'mp3'
      }
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0].endsWith('.mp3')).toBe(true);
    expect(youtubedl.exec).toHaveBeenCalledTimes(1);
  });
});
