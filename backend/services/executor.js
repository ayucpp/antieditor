const { spawn } = require('child_process');
const logger = require('../utils/logger');

/**
 * spawns ffmpeg process and returns a promise that resolves on completion
 * @param {string} commandArgs 
 * @param {string} jobId 
 * @param {Function} onProgress 
 * @returns {Promise<void>}
 */
const executeFFmpeg = (commandArgs, jobId, onProgress) => {
    return new Promise((resolve, reject) => {
        logger.info(`[${jobId}] Spawning FFmpeg: ffmpeg ${commandArgs.join(' ')}`);

        const ffmpeg = spawn('ffmpeg', commandArgs);

        let totalDuration = 0; // In seconds, if we could parse from input, but we can also use metadata passed in?
        // Actually, progress parsing usually looks for "time=00:00:10.50". 
        // To calculate %, we need total duration.
        // We will NOT strictly require % calculation here for simplicity if not passed,
        // but ideally we should know it.
        // We will just emit the raw time string or use regex to parse.

        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();
            logger.info(`[${jobId}] FFmpeg stderr: ${output}`); // Verbose enabled

            // Parse time
            const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
            if (timeMatch) {
                const timeStr = timeMatch[1];
                // Convert to seconds
                const [hours, mins, secs] = timeStr.split(':');
                const seconds = parseFloat(hours) * 3600 + parseFloat(mins) * 60 + parseFloat(secs);

                if (onProgress) {
                    onProgress({ time: seconds, raw: timeStr, log: output });
                }
            }
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                logger.info(`[${jobId}] FFmpeg completed successfully.`);
                resolve();
            } else {
                logger.error(`[${jobId}] FFmpeg failed with code ${code}`);
                reject(new Error(`FFmpeg process exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            logger.error(`[${jobId}] FFmpeg spawn error: ${err.message}`);
            reject(err);
        });
    });
};

module.exports = { executeFFmpeg };
