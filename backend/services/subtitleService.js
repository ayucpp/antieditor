const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Generates subtitles for the given video file
 * @param {string} videoPath 
 * @param {string} outputSrtPath 
 * @returns {Promise<string>} path to srt file
 */
const generateSubtitles = async (videoPath, outputSrtPath) => {
    logger.info(`Generating subtitles for ${videoPath} -> ${outputSrtPath}`);

    // STUB: Generate a dummy SRT content
    // In a real app, this would use Whisper locally or an API

    const dummySrt = `1
00:00:01,000 --> 00:00:04,000
Start of the video.

2
00:00:05,000 --> 00:00:08,000
This is a generated subtitle.

3
00:00:09,000 --> 00:00:12,000
End of the segment.
`;

    await fs.writeFile(outputSrtPath, dummySrt);
    return outputSrtPath;
};

module.exports = { generateSubtitles };
