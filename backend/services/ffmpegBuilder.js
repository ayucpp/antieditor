const logger = require('../utils/logger');
const path = require('path');

/**
 * Builds the FFmpeg filter chain and command arguments
 * @param {string} inputPath 
 * @param {string} outputPath 
 * @param {Object} intent - Validated intent object
 * @param {Object} options - Extra options like subtitlePath
 * @returns {Array<string>} Array of FFmpeg arguments
 */
const buildFFmpegArgs = (inputPath, outputPath, intent, options = {}) => {
    // Base args
    const args = ['-y', '-i', inputPath];
    const videoFilters = [];
    const audioFilters = [];

    // 1. Trim (Apply using filters for precision)
    if (intent.trim) {
        if (intent.trim.start !== null || intent.trim.end !== null) {
            let trimV = `trim=`;
            let trimA = `atrim=`;

            if (intent.trim.start !== null) {
                trimV += `start=${intent.trim.start}`;
                trimA += `start=${intent.trim.start}`;
            }

            if (intent.trim.end !== null) {
                if (intent.trim.start !== null) {
                    trimV += `:`;
                    trimA += `:`;
                }
                trimV += `end=${intent.trim.end}`;
                trimA += `end=${intent.trim.end}`;
            }

            // Reset timestamps to 0 after trim
            trimV += `,setpts=PTS-STARTPTS`;
            trimA += `,asetpts=PTS-STARTPTS`;

            videoFilters.push(trimV);
            audioFilters.push(trimA);
        }
    }

    // 2. Audio Swap (Complex - Mutually exclusive with simple trim for now to avoid complexity explosion)
    if (intent.swapAudio) {
        logger.info(`[FFmpegBuilder] Generating SwapAudio filter...`);
        const { start1, end1, start2, end2 } = intent.swapAudio;
        // Ensure Order: Start1 must be before Start2
        let s1 = start1, e1 = end1, s2 = start2, e2 = end2;
        if (s1 > s2) { [s1, e1, s2, e2] = [s2, e2, s1, e1]; } // Swap definitions

        // We construct 5 segments:
        // P1: 0 -> s1
        // P2: s2 -> e2 (The swapped part B)
        // P3: e1 -> s2
        // P4: s1 -> e1 (The swapped part A)
        // P5: e2 -> End

        // We need filter chains for these.
        // Input is [0:a]
        // Filters:
        // [0:a]atrim=end=s1,asetpts=PTS-STARTPTS[a1];
        // [0:a]atrim=start=s2:end=e2,asetpts=PTS-STARTPTS[a2]; // B moved to A spot
        // [0:a]atrim=start=e1:end=s2,asetpts=PTS-STARTPTS[a3]; 
        // [0:a]atrim=start=s1:end=e1,asetpts=PTS-STARTPTS[a4]; // A moved to B spot
        // [0:a]atrim=start=e2,asetpts=PTS-STARTPTS[a5];
        // [a1][a2][a3][a4][a5]concat=n=5:v=0:a=1[outa]

        // Create segments definitions
        // { start, end, label }
        const segments = [
            { start: 0, end: s1, label: 'a1' },
            { start: s2, end: e2, label: 'a2' },
            { start: e1, end: s2, label: 'a3' },
            { start: s1, end: e1, label: 'a4' },
            { start: e2, end: 999999, label: 'a5' } // 999999 or just start=e2
        ];

        const activeSegments = [];
        let filters = [];

        segments.forEach((seg, i) => {
            if (seg.end !== undefined && seg.start >= seg.end) {
                // Empty segment, skip
                return;
            }

            const label = seg.label;
            let filter = `[0:a]atrim=start=${seg.start}`;
            if (seg.end !== 999999) {
                filter += `:end=${seg.end}`;
            }
            filter += `,asetpts=PTS-STARTPTS[${label}]`;

            filters.push(filter);
            activeSegments.push(`[${label}]`);
        });

        const concatFilter = `${activeSegments.join('')}concat=n=${activeSegments.length}:v=0:a=1[outa]`;
        filters.push(concatFilter);

        // Add to complex filter
        args.push('-filter_complex', filters.join(';'));
        args.push('-map', '0:v'); // Copy video from input 0
        args.push('-map', '[outa]'); // Use new audio

        // Return early? Or allow other filters?
        // If we map here, we can't easily chain -af afterwards without more complex piping.
        // For simplicity: Return here or handling other logic carefully.
        // Let's assume this is the major audio op.

        // Add export args
        args.push(outputPath);
        return args;
    }

    // 2. Silence Removal
    if (intent.silenceRemoval) {
        audioFilters.push('silenceremove=start_periods=1:stop_periods=-1:start_threshold=-50dB:stop_threshold=-50dB');
    }

    // 3. Filters
    if (intent.filter === 'cinematic') {
        videoFilters.push('eq=contrast=1.2:saturation=1.3');
    } else if (intent.filter === 'grayscale') {
        videoFilters.push('hue=s=0');
    }

    // 4. Resize
    if (intent.resize === '9:16') {
        // Center crop to 9:16 (1080x1920)
        videoFilters.push('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
    } else if (intent.resize === '1:1') {
        videoFilters.push('scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080');
    } else if (intent.resize === '16:9') {
        videoFilters.push('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080');
    }

    // 5. Subtitles
    if (intent.subtitles && options.subtitlePath) {
        // Escape path for FFmpeg filter
        // Windows paths might need escaping, assuming Linux here.
        // FFmpeg filter escaping: \ -> /, : -> \:
        const escapedPath = options.subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');

        // IMPORTANT: style options can be added here
        videoFilters.push(`subtitles='${escapedPath}'`);
    }

    // 6. VideoFX (Reverse)
    if (intent.videoFX && intent.videoFX.reverse) {
        if (typeof intent.videoFX.reverse === 'object') {
            // Partial Reverse (In-Place)
            // { start, end }
            const { start, end } = intent.videoFX.reverse;
            logger.info(`[FFmpegBuilder] Generating Partial Reverse filter: ${start} to ${end}`);

            const complexFilters = [];
            const segments = [];

            // Segment 1: Pre-Reverse (0 to start)
            if (start > 0) {
                complexFilters.push(`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v1]`);
                complexFilters.push(`[0:a]atrim=start=0:end=${start},asetpts=PTS-STARTPTS[a1]`);
                segments.push({ v: '[v1]', a: '[a1]' });
            }

            // Segment 2: Reverse (start to end)
            complexFilters.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,reverse[v2]`);
            complexFilters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,areverse[a2]`);
            segments.push({ v: '[v2]', a: '[a2]' });

            // Segment 3: Post-Reverse (end to EOD)
            // We use a large number or just start=end to trim to end
            complexFilters.push(`[0:v]trim=start=${end},setpts=PTS-STARTPTS[v3]`);
            complexFilters.push(`[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[a3]`);
            segments.push({ v: '[v3]', a: '[a3]' });

            // Concatenation
            const inputs = segments.map(s => `${s.v}${s.a}`).join('');
            complexFilters.push(`${inputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`);

            args.push('-filter_complex', complexFilters.join(';'));
            args.push('-map', '[outv]');
            args.push('-map', '[outa]');
            args.push(outputPath);
            return args; // Return early for complex op
        } else {
            // Full Reverse (Boolean)
            videoFilters.push('reverse');
            audioFilters.push('areverse');
        }
    }

    // Construct Filter Complex
    if (videoFilters.length > 0) {
        args.push('-vf', videoFilters.join(','));
    }
    if (audioFilters.length > 0) {
        args.push('-af', audioFilters.join(','));
    }

    // Export
    args.push(outputPath);

    return args;
};

module.exports = { buildFFmpegArgs };
