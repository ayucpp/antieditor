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

        const inputPath = job.inputPath;

        // Re-probe metadata to get accurate duration for this step (in case of chaining)
        try {
            const newMeta = await getMetadata(inputPath);
            job.metadata = newMeta;
            log(`Metadata refreshed: ${newMeta.duration}s`);
        } catch (e) {
            log(`Warning: Could not probe new input. Progress might be inaccurate.`);
        }

        const outputPath = path.join(__dirname, '../temp', `output_${jobId}.mp4`);

        const options = {
            metadata: job.metadata
        };
        logger.info(`[Debug] Job Metadata: ${JSON.stringify(job.metadata)}`);

        // Subtitles
        if (job.intent.subtitles) {
            log('Generating subtitles...');
            const srtPath = path.join(__dirname, '../temp', `${jobId}.srt`);
            // Extract Audio & STT (Mocked)
            await generateSubtitles(inputPath, srtPath);
            options.subtitlePath = srtPath;
            log('Subtitles generated.');
        }

        // Build FFmpeg Args
        log('Building FFmpeg command...');
        const args = buildFFmpegArgs(inputPath, outputPath, job.intent, options);

        // Execute
        log('Executing FFmpeg...');

        await executeFFmpeg(args, jobId, (progressObj) => {
            // Update progress
            // Assuming we know duration from metadata
            const duration = job.metadata.duration;
            if (duration > 0) {
                const percent = Math.min(100, Math.round((progressObj.time / duration) * 100));
                job.progress = percent;
            }
        });

        job.status = 'completed';
        job.progress = 100;
        job.outputPath = outputPath;
        log('Processing complete.');

    } catch (err) {
        log(`Error: ${err.message}`);
        job.status = 'failed';
    }
};

module.exports = router;
