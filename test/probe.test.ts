/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { describe, expect, it } from 'vitest';
import { inspectConfiguration, probeMedia, toLegacyMetadata } from '../src/probe.js';
import type { FfprobeResult } from '../src/types.js';
import { fakeFfmpeg, fakeFfprobe, settings } from './helpers.js';

describe('configuration inspection', () => {
  it('parses formats, aliases, encoders and enabled modules', async () => {
    const result = await inspectConfiguration({ ...settings, ffmpegPath: fakeFfmpeg });
    expect(result.modules).toEqual(['libmp3lame', 'libx264']);
    expect(result.formats).toEqual({
      encode: ['matroska', 'mp4', 'webm'],
      decode: ['matroska', 'mov', 'webm'],
    });
    expect(result.codecs.encode).toEqual(['aac', 'libmp3lame', 'libx264', 'mjpeg']);
    expect(result.encode).toContain('copy');
  });
});

describe('ffprobe integration', () => {
  it('probes JSON metadata through the configured executable', async () => {
    const result = await probeMedia('remote://fixture', { ...settings, ffprobePath: fakeFfprobe });
    expect(result).toMatchObject({
      filename: 'remote://fixture',
      duration: { raw: '00:00:10.50', seconds: 10.5 },
      video: { codec: 'h264', bitrate: 4000, fps: 25 },
      audio: { codec: 'aac', bitrate: 192, sample_rate: 48000 },
    });
  });

  it('reports invalid JSON with stable code and parser cause', async () => {
    await expect(
      probeMedia('remote://invalid-json', { ...settings, ffprobePath: fakeFfprobe }),
    ).rejects.toMatchObject({ code: 118, cause: expect.any(SyntaxError) });
  });

  it('propagates probe process failures and stderr', async () => {
    await expect(
      probeMedia('remote://probe-failure', { ...settings, ffprobePath: fakeFfprobe }),
    ).rejects.toMatchObject({
      code: 115,
      stderr: expect.stringContaining('probe failed intentionally'),
    });
  });
});

describe('legacy metadata mapping', () => {
  it('provides stable empty defaults for an empty ffprobe response', () => {
    expect(toLegacyMetadata('empty.mp4', {})).toMatchObject({
      filename: 'empty.mp4',
      title: '',
      synched: true,
      duration: { raw: '00:00:00.00', seconds: 0 },
      video: {
        container: '',
        bitrate: 0,
        resolution: { w: 0, h: 0 },
        resolutionSquare: {},
        aspect: {},
        fps: 0,
        pixel: 0,
      },
      audio: { codec: '', channels: { raw: '', value: 0 } },
    });
  });

  it('maps tags, container aliases, fallback bitrate and mono audio', () => {
    const raw: FfprobeResult = {
      streams: [
        { index: 2, codec_type: 'video', codec_name: 'vp9', width: 1280, height: 720 },
        { index: 3, codec_type: 'audio', codec_name: 'opus', channels: 1 },
      ],
      format: {
        filename: 'reported.webm',
        format_name: 'matroska,webm',
        duration: '2.25',
        start_time: '0.5',
        bit_rate: '1234000',
        tags: {
          title: 'Title',
          artist: 'Artist',
          album: 'Album',
          track: '7',
          creation_time: '2026',
        },
      },
    };
    expect(toLegacyMetadata('input.webm', raw)).toMatchObject({
      filename: 'reported.webm',
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      track: '7',
      date: '2026',
      synched: false,
      video: { container: 'matroska', bitrate: 1234, aspect: { string: '16:9' } },
      audio: { stream: 3, channels: { raw: 'mono', value: 1 } },
    });
  });

  it.each([
    ['2:1', { w: 1440, h: 480 }, 2],
    ['1:2', { w: 720, h: 960 }, 0.5],
  ])('computes square-pixel resolution for SAR %s', (ratio, resolutionSquare, pixel) => {
    const result = toLegacyMetadata('anamorphic.mp4', {
      streams: [
        {
          codec_type: 'video',
          width: 720,
          height: 480,
          sample_aspect_ratio: ratio,
          r_frame_rate: '30000/1001',
        },
      ],
    });
    expect(result.video.resolutionSquare).toEqual(resolutionSquare);
    expect(result.video.pixel).toBe(pixel);
    expect(result.video.fps).toBeCloseTo(29.97, 2);
  });

  it('prefers rotation tags, then side data, and video title fallback', () => {
    const tagRotation = toLegacyMetadata('tag.mp4', {
      streams: [
        {
          codec_type: 'video',
          width: 10,
          height: 20,
          tags: { rotate: '-90', title: 'Stream title' },
          side_data_list: [{ rotation: 180 }],
        },
      ],
    });
    expect(tagRotation.video.rotate).toBe(-90);
    expect(tagRotation.title).toBe('Stream title');

    const sideRotation = toLegacyMetadata('side.mp4', {
      streams: [{ codec_type: 'video', side_data_list: [{ rotation: 270 }] }],
    });
    expect(sideRotation.video.rotate).toBe(270);
  });

  it('uses explicit display aspect ratio when present', () => {
    const result = toLegacyMetadata('ratio.mp4', {
      streams: [{ codec_type: 'video', width: 720, height: 576, display_aspect_ratio: '16:9' }],
    });
    expect(result.video.aspect).toEqual({ x: 16, y: 9, string: '16:9', value: 16 / 9 });
  });
});
