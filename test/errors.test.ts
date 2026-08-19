import { describe, expect, it } from 'vitest';
import { errors, FfmpegError, renderError } from '../src/errors.js';

describe('legacy errors', () => {
  it('exports every stable numeric error code', () => {
    expect(Object.values(errors).map(({ code }) => code)).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118,
    ]);
  });

  it('keeps legacy message templates discoverable', () => {
    expect(errors.fileinput_not_exist.msg).toContain('%s');
    expect(errors.process_aborted).toEqual({ code: 117, msg: 'FFmpeg was aborted' });
  });

  it('formats interpolated error parameters', () => {
    expect(renderError('codec_not_supported', 'x265')).toMatchObject({
      code: 113,
      msg: 'The codec "x265" is not supported by this FFmpeg build',
      message: 'The codec "x265" is not supported by this FFmpeg build',
    });
  });

  it('creates proper Error instances with cause and stderr', () => {
    const cause = new Error('spawn failed');
    const error = new FfmpegError(114, 'Could not start', { cause, stderr: 'details' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FfmpegError');
    expect(error.code).toBe(114);
    expect(error.msg).toBe(error.message);
    expect(error.cause).toBe(cause);
    expect(error.stderr).toBe('details');
  });

  it('leaves optional diagnostic fields undefined when absent', () => {
    const error = renderError('empty_input_filepath');
    expect(error.stderr).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });
});
