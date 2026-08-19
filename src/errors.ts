import { format } from 'node:util';

const definitions = {
  empty_input_filepath: [100, 'The input file path cannot be empty'],
  input_filepath_must_be_string: [101, 'The input file path must be a string'],
  invalid_option_name: [102, 'The option "%s" is invalid. Check the available options'],
  fileinput_not_exist: [103, 'The input file does not exist: %s'],
  format_not_supported: [104, 'The format "%s" is not supported by this FFmpeg build'],
  audio_channel_is_invalid: [105, 'The audio channel "%s" is not valid'],
  mkdir: [106, 'Could not create directory: %s'],
  extract_frame_invalid_everyN_options: [
    107,
    'Specify only one of every_n_frames, every_n_seconds, or every_n_percentage',
  ],
  invalid_watermark: [108, 'The watermark "%s" does not exist'],
  invalid_watermark_position: [109, 'Invalid watermark position "%s"'],
  size_format: [110, 'The size "%s" is not supported'],
  resolution_square_not_defined: [111, 'The square-pixel resolution is not defined'],
  command_already_exists: [112, 'The command "%s" already exists'],
  codec_not_supported: [113, 'The codec "%s" is not supported by this FFmpeg build'],
  executable_not_found: [114, 'Could not start executable "%s"'],
  process_failed: [115, 'FFmpeg exited with code %s'],
  process_timeout: [116, 'FFmpeg timed out after %s ms'],
  process_aborted: [117, 'FFmpeg was aborted'],
  invalid_probe_output: [118, 'ffprobe returned invalid JSON'],
} as const;

export type ErrorName = keyof typeof definitions;

export class FfmpegError extends Error {
  readonly code: number;
  readonly msg: string;
  override readonly cause?: unknown;
  readonly stderr?: string;

  constructor(code: number, message: string, options?: { cause?: unknown; stderr?: string }) {
    super(message);
    this.name = 'FfmpegError';
    this.code = code;
    this.msg = message;
    if (options && 'cause' in options) this.cause = options.cause;
    if (options?.stderr !== undefined) this.stderr = options.stderr;
  }
}

export function renderError(
  name: ErrorName,
  ...parameters: Array<string | number | undefined>
): FfmpegError {
  const [code, template] = definitions[name];
  return new FfmpegError(code, format(template, ...parameters));
}

export const errors = Object.fromEntries(
  Object.entries(definitions).map(([name, [code, msg]]) => [name, { code, msg }]),
) as Record<ErrorName, { code: number; msg: string }>;
