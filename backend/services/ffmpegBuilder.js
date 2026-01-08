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

        let finalV = '0:v';
        if (videoFilters.length > 0) {
            filters.push(`[0:v]${videoFilters.join(',')}[vfinal]`);
            finalV = '[vfinal]';
        }

        // Add to complex filter
        args.push('-filter_complex', filters.join(';'));
        args.push('-map', finalV); // Use new video map
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

    // 3. Filters (Color Grading)
    if (intent.filter && intent.filter !== 'none') { // Check if filter exists
        let style = 'none';
        let start = null;
        let end = null;

        // Normalization
        if (typeof intent.filter === 'string') {
            style = intent.filter;
        } else if (typeof intent.filter === 'object') {
            style = intent.filter.style;
            start = intent.filter.start;
            end = intent.filter.end;
        }

        if (style !== 'none') {
            // Map styles to FFmpeg filters
            const filterMap = {
                'cinematic': 'eq=contrast=1.2:saturation=1.3',
                'grayscale': 'hue=s=0',
                'sepia': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
                'retro': 'eq=contrast=0.85:saturation=0.6,colorbalance=rs=.2',
                'warm': 'colorbalance=rs=.1:gs=-.1:bs=-.2',
                'cool': 'colorbalance=bs=.1:rs=-.1',
                'vibrant': 'eq=saturation=1.5:contrast=1.1'
            };

            const vf = filterMap[style];

            if (vf) {
                if (start !== null && end !== null) {
                    // Partial Filter Application
                    logger.info(`[FFmpegBuilder] Applying ${style} filter from ${start} to ${end}`);

                    const complexFilters = [];
                    const segments = [];

                    // Segment 1: Pre-Filter
                    if (start > 0) {
                        complexFilters.push(`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v1]`);
                        complexFilters.push(`[0:a]atrim=start=0:end=${start},asetpts=PTS-STARTPTS[a1]`);
                        segments.push({ v: '[v1]', a: '[a1]' });
                    }

                    // Segment 2: Filtered
                    // Apply the color filter here
                    complexFilters.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${vf}[v2]`);
                    complexFilters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a2]`);
                    segments.push({ v: '[v2]', a: '[a2]' });

                    // Segment 3: Post-Filter
                    complexFilters.push(`[0:v]trim=start=${end},setpts=PTS-STARTPTS[v3]`);
                    complexFilters.push(`[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[a3]`);
                    segments.push({ v: '[v3]', a: '[a3]' });

                    // Concatenation
                    const inputs = segments.map(s => `${s.v}${s.a}`).join('');
                    complexFilters.push(`${inputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`);

                    let finalV = '[outv]';
                    if (videoFilters.length > 0) {
                        complexFilters.push(`[outv]${videoFilters.join(',')}[vfinal]`);
                        finalV = '[vfinal]';
                    }

                    args.push('-filter_complex', complexFilters.join(';'));
                    args.push('-map', finalV);
                    args.push('-map', '[outa]');
                    args.push(outputPath);
                    return args; // Return early
                } else {
                    // Full Video Filter
                    videoFilters.push(vf);
                }
            }
        }
    }

    // 4. Resize (Smart Export)
    const resizeObj = intent.resize;
    if (resizeObj) {
        if (resizeObj === '16:9' || resizeObj === 'youtube') {
            // Smart Padding (Fit in Box) - 1920x1080
            // force_original_aspect_ratio=decrease ensures it fits INSIDE 1920x1080
            // pad fills the rest with black
            videoFilters.push('scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
        } else if (resizeObj === '9:16' || resizeObj === 'reels') {
            // Smart Crop (Fill Box) - 1080x1920
            // force_original_aspect_ratio=increase ensures it COVERS 1080x1920
            // crop takes the center 1080x1920
            videoFilters.push('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
        } else if (resizeObj === '1:1' || resizeObj === 'square') {
            // Smart Crop (Fill Box) - 1080x1080
            videoFilters.push('scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080');
        }
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

            let finalV = '[outv]';
            if (videoFilters.length > 0) {
                complexFilters.push(`[outv]${videoFilters.join(',')}[vfinal]`);
                finalV = '[vfinal]';
            }

            args.push('-filter_complex', complexFilters.join(';'));
            args.push('-map', finalV);
            args.push('-map', '[outa]');
            args.push(outputPath);
            return args; // Return early for complex op
        } else {
            // Full Reverse (Boolean)
            videoFilters.push('reverse');
            audioFilters.push('areverse');
        }
    }

    // 7. VideoFX (Speed)
    if (intent.videoFX && intent.videoFX.speed) {
        const { factor, start, end } = intent.videoFX.speed;
        logger.info(`[FFmpegBuilder] Generating Speed filter: ${factor}x from ${start} to ${end}`);

        const complexFilters = [];
        const segments = [];

        // Segment 1: Pre-Speed (0 to start)
        if (start > 0) {
            complexFilters.push(`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v1]`);
            complexFilters.push(`[0:a]atrim=start=0:end=${start},asetpts=PTS-STARTPTS[a1]`);
            segments.push({ v: '[v1]', a: '[a1]' });
        }

        // Segment 2: Speed (start to end)
        // Video Speed: faster means lower PTS (setpts=0.5*PTS for 2x speed)
        const videoSpeedFilter = `setpts=${1 / factor}*PTS`;

        // Audio Speed: limit atempo to 0.5 - 2.0 range, chain if needed
        let audioSpeedFilters = [];
        let f = factor;
        while (f > 2.0) {
            audioSpeedFilters.push('atempo=2.0');
            f /= 2.0;
        }
        while (f < 0.5) {
            audioSpeedFilters.push('atempo=0.5');
            f /= 0.5;
        }
        audioSpeedFilters.push(`atempo=${f}`);
        const audioSpeedChain = audioSpeedFilters.join(',');

        complexFilters.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${videoSpeedFilter}[v2]`);
        complexFilters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,${audioSpeedChain}[a2]`);
        segments.push({ v: '[v2]', a: '[a2]' });

        // Segment 3: Post-Speed (end to EOD)
        // We use a large number or just start=end to trim to end
        complexFilters.push(`[0:v]trim=start=${end},setpts=PTS-STARTPTS[v3]`);
        complexFilters.push(`[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[a3]`);
        segments.push({ v: '[v3]', a: '[a3]' });

        // Concatenation
        const inputs = segments.map(s => `${s.v}${s.a}`).join('');
        complexFilters.push(`${inputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`);

        let finalV = '[outv]';
        if (videoFilters.length > 0) {
            complexFilters.push(`[outv]${videoFilters.join(',')}[vfinal]`);
            finalV = '[vfinal]';
        }

        args.push('-filter_complex', complexFilters.join(';'));
        args.push('-map', finalV);
        args.push('-map', '[outa]');
        args.push(outputPath);
        return args; // Return early for complex op
    }

    // 8. VideoFX (Remove / Cut)
    if (intent.videoFX && intent.videoFX.remove) {
        const { start, end } = intent.videoFX.remove;
        logger.info(`[FFmpegBuilder] Generating Remove filter: remove ${start} to ${end}`);

        const complexFilters = [];
        const segments = [];

        // Segment 1: Pre-Cut (0 to start)
        if (start > 0) {
            complexFilters.push(`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v1]`);
            complexFilters.push(`[0:a]atrim=start=0:end=${start},asetpts=PTS-STARTPTS[a1]`);
            segments.push({ v: '[v1]', a: '[a1]' });
        }

        // Segment 2: Post-Cut (end to EOD)
        complexFilters.push(`[0:v]trim=start=${end},setpts=PTS-STARTPTS[v2]`);
        complexFilters.push(`[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[a2]`);
        segments.push({ v: '[v2]', a: '[a2]' });

        // Concatenation
        const inputs = segments.map(s => `${s.v}${s.a}`).join('');
        complexFilters.push(`${inputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`);

        let finalV = '[outv]';
        if (videoFilters.length > 0) {
            complexFilters.push(`[outv]${videoFilters.join(',')}[vfinal]`);
            finalV = '[vfinal]';
        }

        args.push('-filter_complex', complexFilters.join(';'));
        args.push('-map', finalV);
        args.push('-map', '[outa]');
        args.push(outputPath);
        return args; // Return early
    }

    // 8. VideoFX (Zoom / Crop Segments)
    if (intent.videoFX && intent.videoFX.zoom) {
        const { factor, start, end } = intent.videoFX.zoom;
        const zoomFactor = factor || 1.5;
        logger.info(`[FFmpegBuilder] Generating Zoom filter: ${zoomFactor}x from ${start} to ${end}`);

        const complexFilters = [];
        const segments = [];

        // 1. Pre-segment
        if (start > 0) {
            complexFilters.push(`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS,setsar=1[v1]`);
            complexFilters.push(`[0:a]atrim=start=0:end=${start},asetpts=PTS-STARTPTS[a1]`);
            segments.push({ v: '[v1]', a: '[a1]' });
        }

        // 2. Middle (Zoomed)
        // Filter: crop=iw/factor:ih/factor,scale=originalW:originalH
        const targetW = options.metadata ? options.metadata.width : 'iw*' + zoomFactor; // Fallback if no metadata (risky but better than iw)
        const targetH = options.metadata ? options.metadata.height : 'ih*' + zoomFactor;

        complexFilters.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,crop=iw/${zoomFactor}:ih/${zoomFactor},scale=${targetW}:${targetH},setsar=1[v2]`);
        complexFilters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a2]`);
        segments.push({ v: '[v2]', a: '[a2]' });

        // 3. Post-segment
        complexFilters.push(`[0:v]trim=start=${end},setpts=PTS-STARTPTS,setsar=1[v3]`);
        complexFilters.push(`[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[a3]`);
        segments.push({ v: '[v3]', a: '[a3]' });

        // 4. Concat
        const inputs = segments.map(s => `${s.v}${s.a}`).join('');
        complexFilters.push(`${inputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`);

        let finalV = '[outv]';
        if (videoFilters.length > 0) {
            complexFilters.push(`[outv]${videoFilters.join(',')}[vfinal]`);
            finalV = '[vfinal]';
        }

        args.push('-filter_complex', complexFilters.join(';'));
        args.push('-map', finalV);
        args.push('-map', '[outa]');
        args.push(outputPath);
        return args;
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
