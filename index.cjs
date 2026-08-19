'use strict';

const api = require('./dist/index.cjs');
const ffmpeg = api.default;

Object.assign(ffmpeg, api);
ffmpeg.default = ffmpeg;

module.exports = ffmpeg;
