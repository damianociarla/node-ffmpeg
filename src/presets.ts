export const sizes = {
  SQCIF: '128x96',
  QCIF: '176x144',
  CIF: '352x288',
  '4CIF': '704x576',
  QQVGA: '160x120',
  QVGA: '320x240',
  VGA: '640x480',
  SVGA: '800x600',
  XGA: '1024x768',
  UXGA: '1600x1200',
  QXGA: '2048x1536',
  SXGA: '1280x1024',
  QSXGA: '2560x2048',
  HSXGA: '5120x4096',
  WVGA: '852x480',
  WXGA: '1366x768',
  WSXGA: '1600x1024',
  WUXGA: '1920x1200',
  WOXGA: '2560x1600',
  WQSXGA: '3200x2048',
  WQUXGA: '3840x2400',
  WHSXGA: '6400x4096',
  WHUXGA: '7680x4800',
  CGA: '320x200',
  EGA: '640x350',
  HD480: '852x480',
  HD720: '1280x720',
  HD1080: '1920x1080',
} as const;

export const ratios = {
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '14:9': 14 / 9,
  '16:9': 16 / 9,
  '21:9': 21 / 9,
} as const;

export const audioChannels = { mono: 1, stereo: 2 } as const;

export const presets = { size: sizes, ratio: ratios, audio_channel: audioChannels } as const;
