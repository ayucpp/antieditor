const { spawn } = require('child_process');
const logger = require('./logger');

/**
 * Run ffprobe to get metadata for a video file
 * @param {string} filePath - Absolute path to the video file
 * @returns {Promise<Object>} - Metadata object
 */
const getMetadata = (filePath) => {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            filePath
        ]);

        let stdoutData = '';
        let stderrData = '';

        ffprobe.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                logger.error(`ffprobe failed with code ${code}: ${stderrData}`);
                return reject(new Error('Failed to probe video file'));
            }

            try {
                const data = JSON.parse(stdoutData);
                const videoStream = data.streams.find(s => s.codec_type === 'video');
                const audioStream = data.streams.find(s => s.codec_type === 'audio');

                if (!videoStream) {
                    return reject(new Error('No video stream found'));
                }

                const metadata = {
                    duration: parseFloat(data.format.duration),
                    resolution: `${videoStream.width}x${videoStream.height}`,
                    hasAudio: !!audioStream,
                    frameRate: videoStream.r_frame_rate // e.g., "30/1"
                };
                resolve(metadata);
            } catch (err) {
                logger.error(`Failed to parse ffprobe output: ${err.message}`);
                reject(err);
            }
        });

        ffprobe.on('error', (err) => {
            logger.error(`Failed to spawn ffprobe: ${err.message}`);
            reject(err);
        });

        // Timeout Safety
        setTimeout(() => {
            if (!ffprobe.killed) {
                ffprobe.kill();
                reject(new Error('ffprobe timed out after 10s'));
            }
        }, 10000);
    });
};

module.exports = { getMetadata };
