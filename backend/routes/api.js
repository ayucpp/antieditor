const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');

const logger = require('../utils/logger');
const { getMetadata } = require('../utils/ffprobe');
const { parsePromptWithLLM } = require('../services/llmParser');
const { validateIntent } = require('../services/intentValidator');
const { buildFFmpegArgs } = require('../services/ffmpegBuilder');
const { executeFFmpeg } = require('../services/executor');
const { generateSubtitles } = require('../services/subtitleService');

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../temp'));
    },
    filename: (req, file, cb) => {
        // Keep extension
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage });

// In-memory Job Store (For demo purposes; use DB in prod)
const jobs = {};
// Structure: { jobId: { status: 'pending'|'processing'|'completed'|'failed', progress: 0, logs: [], inputPath, outputPath, metadata, intent } }

// 0. GET / (Health Check)
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Video Editing Backend is running',
        version: '1.0.0',
        endpoints: [
            'POST /upload',
            'POST /parse-prompt',
            'POST /process-video',
            'GET /status/:jobId',
            'GET /download/:jobId'
        ]
    });
});

// 1. POST /upload
router.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video uploaded' });

        const jobId = path.basename(req.file.filename, path.extname(req.file.filename)); // use filename uuid as job id part
        const filePath = req.file.path;

        logger.info(`[${jobId}] File uploaded: ${filePath}`);

        const metadata = await getMetadata(filePath);

        jobs[jobId] = {
            id: jobId,
            status: 'uploaded',
            inputPath: filePath,
            metadata,
            progress: 0,
            logs: []
        };

        res.json({
            jobId,
            metadata
        });
    } catch (err) {
        logger.error(`Upload error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// 2. POST /parse-prompt
router.post('/parse-prompt', async (req, res) => {
    try {
        const { prompt, jobId } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        let context = "";
        if (jobId && jobs[jobId]) {
            const job = jobs[jobId];
            if (job.metadata) {
                context = `Video Context: Duration ${job.metadata.duration} seconds. Resolution ${job.metadata.resolution}.`;
            }
        }

        // 1. LLM Parse
        const rawIntent = await parsePromptWithLLM(prompt, context);

        // 1.5 Apply Overrides (from UI buttons)
        if (req.body.overrides) {
            if (req.body.overrides.resize) {
                rawIntent.resize = req.body.overrides.resize;
            }
        }

        // 2. Validate
        try {
            const validatedIntent = validateIntent(rawIntent);
            res.json(validatedIntent);
        } catch (validationError) {
            logger.warn(`Validation failed: ${validationError.message}`);
            // Return helpful error
            res.status(400).json({
                error: 'Intent validation failed',
                details: validationError.issues
            });
        }

    } catch (err) {
        logger.error(`Parse prompt error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// 3. POST /process-video
router.post('/process-video', async (req, res) => {
    try {
        const { jobId, intent } = req.body;
        // Support 'parentJobId' if we want explicit chaining, or just use 'jobId' as the source.
        // Better: frontend sends 'jobId' as SOURCE. We create NEW job.

        if (!jobId || !intent) return res.status(400).json({ error: 'Source JobId and Intent required' });

        const sourceJob = jobs[jobId];
        if (!sourceJob) {
            logger.error(`[Process] Source Job ${jobId} not found! Available: ${Object.keys(jobs)}`);
            return res.status(404).json({ error: 'Source Job not found' });
        }

        logger.info(`[Process] Chaining from Source Job ${jobId}. Status: ${sourceJob.status}`);
        if (sourceJob.outputPath) logger.info(`[Process] Found OutputPath: ${sourceJob.outputPath}`);
        else logger.info(`[Process] No OutputPath, using InputPath: ${sourceJob.inputPath}`);

        // Create NEW Job for this operation
        const newJobId = uuidv4();

        // Determine Input Path: Use Output of source if available, else Input of source
        // This enables chaining: Job 1 Output -> Job 2 Input
        const inputPath = sourceJob.outputPath || sourceJob.inputPath;

        // Inherit metadata? Or re-probe? 
        // Re-probing is safer as duration changes. We'll do it async in processJob or right here.
        // Let's copy reference for now and update in processJob if we want.
        // Or simpler: just use strict input path.

        jobs[newJobId] = {
            id: newJobId,
            status: 'queued',
            inputPath: inputPath,
            metadata: sourceJob.metadata, // Warning: Metadata might be stale (e.g. duration). consider updating.
            intent: intent,
            progress: 0,
            logs: [],
            parentId: jobId
        };

        // Validate intent
        try {
            validateIntent(intent);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid intent schema' });
        }

        logger.info(`[Process] Starting Job ${newJobId} with Intent: ${JSON.stringify(intent)}`);

        // Start Async Processing
        processJob(newJobId);

        // Return NEW Job ID to frontend
        res.json({ status: 'processing', message: 'Job started', newJobId: newJobId });

    } catch (err) {
        logger.error(`Process video error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// 4. GET /status/:jobId
router.get('/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];
    if (!job) return res.status(404).json({ error: 'Job not found' });

    res.json({
        stage: job.status,
        progress: job.progress,
        logs: job.logs
    });
});

// 5. GET /download/:jobId
router.get('/download/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];

    if (!job || job.status !== 'completed' || !job.outputPath) {
        return res.status(404).json({ error: 'File not ready or job not found' });
    }

    res.download(job.outputPath);
});

// --- Internal Processing Function ---
const processJob = async (jobId) => {
    const job = jobs[jobId];
    job.status = 'processing';
    const log = (msg) => {
        job.logs.push(`[${new Date().toISOString()}] ${msg}`);
        logger.info(`[${jobId}] ${msg}`);
    };

    try {
        log('Starting processing pipeline...');

        let currentInputPath = job.inputPath;

        // Re-probe metadata to get accurate duration for this step (in case of chaining)
        try {
            const newMeta = await getMetadata(currentInputPath);
            job.metadata = newMeta;
            log(`Metadata refreshed: ${newMeta.duration}s`);
        } catch (e) {
            log(`Warning: Could not probe new input. Progress might be inaccurate.`);
        }

        const options = {
            metadata: job.metadata
        };
        logger.info(`[Debug] Job Metadata: ${JSON.stringify(job.metadata)}`);

        // Subtitles Pre-generation (if needed)
        if (job.intent.subtitles) {
            log('Generating subtitles...');
            const srtPath = path.join(__dirname, '../temp', `${jobId}.srt`);
            // Extract Audio & STT (Mocked)
            await generateSubtitles(currentInputPath, srtPath);
            options.subtitlePath = srtPath;
            log('Subtitles generated.');
        }

        // --- PIPELINE CONSTRUCTION ---
        // Decompose intent into atomic operations to process sequentially
        // Order: Remove -> VideoFX (Speed/Reverse) -> Zoom -> Filter -> Subtitles -> Resize -> SwapAudio
        const pipeline = [];
        const intent = job.intent;

        // 1. Remove/Cut
        if (intent.videoFX && intent.videoFX.remove) {
            pipeline.push({ name: 'Remove', intent: { videoFX: { remove: intent.videoFX.remove } } });
        }

        // 2. VideoFX (Speed)
        if (intent.videoFX && intent.videoFX.speed) {
            pipeline.push({ name: 'Speed', intent: { videoFX: { speed: intent.videoFX.speed } } });
        }

        // 3. VideoFX (Reverse)
        if (intent.videoFX && intent.videoFX.reverse) {
            pipeline.push({ name: 'Reverse', intent: { videoFX: { reverse: intent.videoFX.reverse } } });
        }

        // 4. Zoom
        if (intent.videoFX && intent.videoFX.zoom) {
            pipeline.push({ name: 'Zoom', intent: { videoFX: { zoom: intent.videoFX.zoom } } });
        }

        // 5. Filter
        if (intent.filter && intent.filter !== 'none') {
            pipeline.push({ name: 'Filter', intent: { filter: intent.filter } });
        }

        // 6. Subtitles (Burning)
        if (intent.subtitles) {
            pipeline.push({ name: 'Subtitles', intent: { subtitles: true } });
        }

        // 7. Resize
        if (intent.resize) {
            pipeline.push({ name: 'Resize', intent: { resize: intent.resize } });
        }

        // 8. Swap Audio
        if (intent.swapAudio) {
            pipeline.push({ name: 'SwapAudio', intent: { swapAudio: intent.swapAudio } });
        }

        // 9. Simple Trim (if not covered by other FX) - tricky if already processed.
        // If pipeline is empty, check for simple trim.
        // Or if simple trim exists and acts as a master trim.
        if (intent.trim && (intent.trim.start !== null || intent.trim.end !== null)) {
            // Assuming Trim is master trim, maybe do it first? Or last?
            // Often better First to save processing.
            pipeline.unshift({ name: 'Trim', intent: { trim: intent.trim } });
        }

        if (pipeline.length === 0) {
            log('No operations detected. Copying file...');
            const finalPath = path.join(__dirname, '../temp', `output_${jobId}.mp4`);
            fs.copySync(currentInputPath, finalPath);
            job.status = 'completed';
            job.progress = 100;
            job.outputPath = finalPath;
            return;
        }

        log(`Pipeline stages: ${pipeline.map(p => p.name).join(' -> ')}`);

        // --- PIPELINE EXECUTION ---
        let tempFiles = [];

        for (let i = 0; i < pipeline.length; i++) {
            const stage = pipeline[i];
            const isLast = i === pipeline.length - 1;
            log(`[Stage ${i + 1}/${pipeline.length}] Executing ${stage.name}...`);

            const stageOutputPath = isLast
                ? path.join(__dirname, '../temp', `output_${jobId}.mp4`)
                : path.join(__dirname, '../temp', `temp_${jobId}_${i}.mp4`);

            // Build args for this specific atomic intent
            // Merge options if needed (e.g. subtitles path)
            const args = buildFFmpegArgs(currentInputPath, stageOutputPath, stage.intent, options);

            await executeFFmpeg(args, jobId, (progressObj) => {
                // Calculate Scaled Progress
                // Each stage contributes 1/N to total
                const stageWeight = 100 / pipeline.length;
                const stageBase = i * stageWeight;

                // Estimate stage progress
                // Note: duration might change (cut/speed), so this is rough.
                let percent = 0;
                if (job.metadata.duration > 0) {
                    percent = Math.min(100, Math.round((progressObj.time / job.metadata.duration) * 100));
                }

                job.progress = Math.round(stageBase + (percent * (stageWeight / 100)));
            });

            if (!isLast) {
                tempFiles.push(stageOutputPath);
                currentInputPath = stageOutputPath;
                // Update metadata for next step (size/duration might have changed)
                try {
                    const newMeta = await getMetadata(currentInputPath);
                    job.metadata = newMeta; // Update for next step calculations
                    options.metadata = newMeta;
                } catch (e) {
                    log(`Warning: Metadata probe failed for intermediate step.`);
                }
            } else {
                job.outputPath = stageOutputPath;
            }
        }

        // Cleanup intermediate files
        log('Cleaning up intermediate files...');
        for (const f of tempFiles) {
            fs.remove(f).catch(e => log(`Failed to delete temp ${f}`));
        }

        job.status = 'completed';
        job.progress = 100;
        log('Processing complete.');

    } catch (err) {
        log(`Error: ${err.message}`);
        job.status = 'failed';
    }
};

module.exports = router;
