module.exports = function () {
	/**
	 * A public var that is to the information available about
	 * the current ffmpeg compiled binary.
	 * @var mixed
	 * @access public
	 */
	this.ffmpeg_info		= false;

	/**
	 * A protected var that contains the info of any file that is accessed by PHPVideoToolkit::getFileInfo();
	 * @var array
	 * @access protected
	 */
	this._file_info		= new Array();

	/**
	 * Determines what happens when an error occurs
	 * @var boolean If true then the script will die, if not false is return by the error
	 * @access public
	 */
	this.on_error_die			= false;

	/**
	 * Holds the log file name
	 * @var string
	 * @access protected
	 */
	this._log_file				= null;

	/**
	 * Determines if when outputting image frames if the outputted files should have the %d number
	 * replaced with the frames timecode.
	 * @var boolean If true then the files will be renamed.
	 * @access public
	 */
	this.image_output_timecode 	= true;

	/**
	 * Holds the timecode separator for when using $image_output_timecode = true
	 * Not all systems allow ':' in filenames.
	 * @var string
	 * @access public
	 */
	this.timecode_seperator_output = '-';

	/**
	 * Holds the starting time code when outputting image frames.
	 * @var string The timecode hh(n):mm:ss:ff
	 * @access protected
	 */
	this._image_output_timecode_start = '00:00:00.00';

	/**
	 * The format in which the image %timecode placeholder string is outputted.
	 * 	- %hh (hours) representative of hours
	 * 	- %mm (minutes) representative of minutes
	 * 	- %ss (seconds) representative of seconds
	 * 	- %fn (frame number) representative of frames (of the current second, not total frames)
	 * 	- %ms (milliseconds) representative of milliseconds (of the current second, not total milliseconds) (rounded to 3 decimal places)
	 * 	- %ft (frames total) representative of total frames (ie frame number)
	 * 	- %st (seconds total) representative of total seconds (rounded).
	 * 	- %sf (seconds floored) representative of total seconds (floored).
	 * 	- %mt (milliseconds total) representative of total milliseconds. (rounded to 3 decimal places)
	 * NOTE; there are special characters that will be replace by PHPVideoToolkit::$timecode_seperator_output, these characters are
	 * 	- :
	 *  - .
	 * @var string 
	 * @access public
	 */
	this.image_output_timecode_format = '%hh-%mm-%ss-%fn';

	/**
	 * Holds the fps of image extracts
	 * @var integer
	 * @access protected
	 */
	this._image_output_timecode_fps = 1;

	/**
	 * Holds the current execute commands that will need to be combined
	 * @var array
	 * @access protected
	 */
	this._commands 			= new Array();

	/**
	 * Holds the commands executed
	 * @var array
	 * @access protected
	 */
	this._processed 		= new Array();

	/**
	 * Holds the file references to those that have been processed
	 * @var array
	 * @access protected
	 */
	this._files	 			= new Array();

	/**
	 * Holds the errors encountered
	 * @access protected
	 * @var array
	 */
	this._errors 			= new Array();

	/**
	 * Holds the input file / input file sequence
	 * @access protected
	 * @var string
	 */
	this._input_file 		= null;

	/**
	 * Holds the output file / output file sequence
	 * @access protected
	 * @var string
	 */
	this._output_address 	= null;

	/**
	 * Holds the process file / process file sequence
	 * @access protected
	 * @var string
	 */
	this._process_address 	= null;

	/**
	 * Temporary filename prefix
	 * @access protected
	 * @var string
	 */
	this._tmp_file_prefix	= 'tmp_';

	/**
	 * Holds the temporary directory name
	 * @access protected
	 * @var string
	 */
	this._tmp_directory 	= null;

	/**
	 * Holds the directory paths that need to be removed by the ___destruct function
	 * @access protected
	 * @var array
	 */
	this._unlink_dirs		= new Array();

	/**
	 * Holds the file paths that need to be deleted by the ___destruct function
	 * @access protected
	 * @var array
	 */
	this._unlink_files		= new Array();

	/**
	 * Holds the timer start micro-float.
	 * @access protected
	 * @var integer
	 */
	this._timer_start		= 0;

	/**
	 * Holds the times taken to process each file.
	 * @access protected
	 * @var array
	 */
	this._timers			= new Array();

	/**
	 * Holds the times taken to process each file.
	 * @access protected
	 * @var constant
	 */
	this._overwrite_mode	= null;

	/**
	 * Holds a integer value that flags if the image extraction is just a single frame.
	 * @access protected
	 * @var integer
	 */
	this._single_frame_extraction	= null;

	/**
	 * Holds the watermark file that is used to watermark any outputted images via GD.
	 * @access protected
	 * @var string
	 */
	this._watermark_url	= null;

	/**
	 * Holds the watermark options used to watermark any outputted images via GD.
	 * @access protected
	 * @var array
	 */
	this._watermark_options	= null;

	/**
	 * Holds the number of files processed per run.
	 * @access protected
	 * @var integer
	 */
	this._process_file_count = 0;

	/**
	 * Holds the times taken to process each file.
	 * @access protected
	 * @var array
	 */
	this._post_processes	= new Array();

	/**
	 * Holds commands should be sent added to the exec before the input file, this is by no means a definitive list
	 * of all the ffmpeg commands, as it only utilizes the ones in use by this class. Also only commands that have 
	 * specific required places are entered in the arrays below. Anything not in these arrays will be treated as an 
	 * after-input item.
	 * @access protected
	 * @var array
	 */
	this._cmds_before_input		= array('-inputr');
}