'use strict';

const ffmpeg = require('..');

if (typeof ffmpeg !== 'function') throw new TypeError('CommonJS default export is not callable');
if (typeof ffmpeg.create !== 'function') throw new TypeError('CommonJS named exports are missing');
if (typeof ffmpeg.createClient !== 'function')
  throw new TypeError('CommonJS createClient export is missing');
