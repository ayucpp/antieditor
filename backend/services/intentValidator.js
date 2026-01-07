const { z } = require('zod');

// Strict Intent Schema
const intentSchema = z.object({
    swapAudio: z.object({
        start1: z.number(),
        end1: z.number(),
        start2: z.number(),
        end2: z.number(),
    }).nullable().optional(),
    trim: z.object({
        start: z.number().nullable(),
        end: z.number().nullable(),
    }).nullable().optional().default({ start: null, end: null }),
    silenceRemoval: z.boolean().nullable().optional().default(false),
    subtitles: z.boolean().nullable().optional().default(false),
    filter: z.enum(['cinematic', 'grayscale', 'none']).nullable().optional().default('none'),
    resize: z.enum(['9:16', '1:1', '16:9']).nullable().optional().default(null),
    videoFX: z.object({
        reverse: z.union([
            z.boolean(),
            z.object({
                start: z.number(),
                end: z.number()
            })
        ])
    }).nullable().optional(),
    export: z.literal('mp4'),
}).strict(); // No additional keys allowed

/**
 * Validate intent object against schema
 * @param {Object} data 
 * @returns {Object} Validated data
 * @throws {ZodError}
 */
const validateIntent = (data) => {
    return intentSchema.parse(data);
};

module.exports = { intentSchema, validateIntent };
