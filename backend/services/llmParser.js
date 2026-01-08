const logger = require('../utils/logger');
// const fetch = require('node-fetch'); // Enable for legacy Node

const API_KEY = process.env.LLM_API_KEY;
const PROVIDER = process.env.LLM_PROVIDER || 'openai';
const MODEL = process.env.LLM_MODEL || (PROVIDER === 'gemini' ? 'gemini-2.0-flash-lite-001' : 'gpt-4o');

const SYSTEM_PROMPT = `
You are a strict intent extraction engine.
Return ONLY valid JSON.
Do not explain.
Do not include code.
Do not include markdown.
Do not guess values.
If information is missing, use null.
Only use the allowed schema.

Intent Schema (Strict)
{
  "swapAudio": {
    "start1": number,
    "end1": number,
    "start2": number,
    "end2": number
  } | null, // Use this for audio swapping requests
  "trim": {
    "start": number | null,
    "end": number | null
  },
  "silenceRemoval": boolean,
  "subtitles": boolean,
  "filter": {
      "style": "cinematic" | "grayscale" | "sepia" | "retro" | "warm" | "cool" | "vibrant" | "none",
      "start": number | null,
      "end": number | null
  } | "none",
  "resize": "9:16" | "1:1" | "16:9" | "youtube" | "reels" | "square" | "original" | null,
  "export": "mp4"
}
  "videoFX": {
    "reverse": boolean | { "start": number, "end": number },
    "speed": {
       "factor": number,
       "start": number,
       "end": number
    },
    "remove": {
       "start": number,
       "end": number
    },
    "zoom": {
       "factor": number,
       "start": number,
       "end": number
    }
  },
  "export": "mp4"
}

CONTEXT RESOLUTION RULES:
1. You will be provided with video context (Duration, Resolution).
2. You MUST use the "Duration" to calculate absolute timestamps.
   - "Last N seconds" means the interval [Duration - N, Duration].
   - Example: If Duration is 172.06 and user says "last 30s", range is [142.06, 172.06].
   - NEVER output a timestamp greater than Duration.
3. "Swap Audio":
   - "First 30s" = [0, 30]
   - "Last 30s" = [Duration - 30, Duration]
   - Ensure start < end.
4. For "trim", "resize", "swapAudio", or "videoFX", if the feature is NOT requested, return null. 
5. Do NOT include any reasoning or thinking trace in the output. ONLY the JSON.
6. INTERPRETATION RULE: "Reverse from X to Y" means "Trim X to Y" AND "Reverse".
`;

const parsePromptWithLLM = async (prompt, context = "") => {
  logger.info(`[LLM] Receiving prompt: "${prompt}" with context: "${context}"`);

  let intent;
  let source = 'LLM';

  if (!API_KEY || API_KEY.includes('your_')) {
    logger.warn('[LLM] No valid API KEY found in .env (LLM_API_KEY). Using Mock mode (Limited capabilities).');
    source = 'Mock';
    intent = await parseMock(prompt, context);
  } else {
    try {
      if (PROVIDER === 'gemini') {
        intent = await callGemini(prompt, context);
      } else {
        intent = await callOpenAI(prompt, context);
      }
    } catch (error) {
      logger.error(`[LLM] Request failed: ${error.message}. Falling back to mock.`);
      source = 'MockFallback';
      intent = await parseMock(prompt, context);
    }
  }

  // --- SANITIZATION & SAFEGUARDS ---
  // Fix: Prevent "resize" hallucination when user only asks for speed/trim
  if (intent.resize) {
    // Keywords that strongly suggest a resize intent
    const strongKeywords = ['resize', 'aspect', 'ratio', 'crop', 'format', 'square', 'landscape', 'portrait', 'vertical', 'horizontal', 'reel', 'story', 'post', 'youtube', 'tiktok', 'instagram'];

    // Ratio keywords needing strict matching (to avoid "1:10" matching "1:1")
    const ratioKeywords = ['16:9', '9:16', '1:1'];

    const lowerPrompt = prompt.toLowerCase();

    // 1. Check strong keywords (simple substring OK for these unique words)
    const hasStrongKeyword = strongKeywords.some(kw => lowerPrompt.includes(kw));

    // 2. Check ratio keywords with regex to avoid timestamp partial matches
    // Matches "1:1" but not "1:10", "11:1", etc.
    const hasRatioKeyword = ratioKeywords.some(kw => {
      // Escape the colon for regex
      const escapedKw = kw.replace(':', '\\:');
      // Look behind: space or start of string
      // Look ahead: space, end of string, or non-digit
      const regex = new RegExp(`(^|\\s|[^\\d])${escapedKw}($|\\s|[^\\d])`);
      return regex.test(lowerPrompt);
    });

    if (!hasStrongKeyword && !hasRatioKeyword) {
      logger.warn(`[LLM-Sanitize][${source}] detected resize intent "${intent.resize}" without explicit keywords in prompt. Suppressing resize.`);
      intent.resize = null;
    }
  }

  return intent;
};

const callGemini = async (prompt, context) => {
  // Gemini API: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=API_KEY
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  // Construct prompt with system instructions
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${SYSTEM_PROMPT}\n\n${context}\n\nTask: Extract structured video editing intent from the following prompt.\nPrompt: "${prompt}"` }]
          }],
          generationConfig: {
            response_mime_type: "application/json"
          }
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : (2000 * Math.pow(2, attempts));
          logger.warn(`[LLM-Gemini] Rate limited (429). Retrying in ${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime));
          attempts++;
          continue;
        }
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} ${errText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) throw new Error('Gemini returned empty response');

      logger.info(`[LLM-Gemini] Raw response: ${text}`);
      return JSON.parse(text);

    } catch (err) {
      if (attempts === maxAttempts - 1) throw err;
      logger.warn(`[LLM-Gemini] Request failed: ${err.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempts)));
      attempts++;
    }
  }
  throw new Error('Gemini API request failed after max retries');
};

const callOpenAI = async (prompt, context) => {
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';

  logger.info(`[LLM-OpenAI] Requesting completion from ${baseUrl} for model ${MODEL}`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY || 'ollama'}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${context}\n\nExtract structured video editing intent from the following prompt.\nPrompt: "${prompt}"` }
      ],
      temperature: 0,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  logger.info(`[LLM-OpenAI] Raw response: ${content}`);
  return JSON.parse(content);
};

const parseMock = async (prompt, context = "") => {
  logger.info('[MockLLM] Using smart heuristic parser.');

  // Base Response
  const response = {
    swapAudio: null,
    trim: { start: null, end: null },
    silenceRemoval: false,
    subtitles: false,
    filter: { style: 'none', start: null, end: null },
    resize: null,
    videoFX: { reverse: false, speed: null, remove: null, zoom: null },
    export: 'mp4'
  };

  // Helper to parse "MM:SS" or "SS"
  const parseTime = (m, s) => {
    if (s) return parseInt(m) * 60 + parseInt(s);
    return parseInt(m);
  };

  // Extract Duration from Context
  let duration = 0;
  const durationMatch = context.match(/Duration (\d+(?:\.\d+)?) seconds/);
  if (durationMatch) {
    duration = parseFloat(durationMatch[1]);
  }

  // Split prompt into clauses
  // Delimiters: " and ", ". ", ", ", " then ", " & "
  // We use a regex to split but keep the flow legitimate
  const clauses = prompt.toLowerCase().split(/(?: and |\. |\, | then | & )/);

  // Helper to parse a single clause
  const parseClause = (text) => {
    const intent = {
      // Partial updates
    };

    // 1. Time Range Extraction (Clause-Specific)
    let start = null;
    let end = null;

    // "from X to Y", "between X and Y"
    const rangeMatch = text.match(/(?:from|starting|trim|between|at) (\d+):?(\d+)?(?:s)?\s*(?:to|until|-|and|&)\s*(\d+):?(\d+)?(?:s)?/);
    if (rangeMatch) {
      start = parseTime(rangeMatch[1], rangeMatch[2]);
      end = parseTime(rangeMatch[3], rangeMatch[4]);
    }

    // "last N seconds"
    const lastMatch = text.match(/last (\d+)(?:s| seconds)?/);
    if (lastMatch && duration > 0) {
      const seconds = parseInt(lastMatch[1]);
      start = Math.max(0, duration - seconds);
      end = duration;
    }

    // "first N seconds"
    const firstMatch = text.match(/(?:first|start) (\d+)(?:s| seconds)?/);
    if (firstMatch) {
      start = 0;
      end = parseInt(firstMatch[1]);
    }

    // 2. Identify Action

    // A. Filter
    const styles = ['cinematic', 'grayscale', 'sepia', 'retro', 'warm', 'cool', 'vibrant'];
    let style = 'none';
    styles.forEach(s => { if (text.includes(s)) style = s; });
    if (text.includes('black and white')) style = 'grayscale';
    if (text.includes('old school') || text.includes('vintage')) style = 'retro';

    if (style !== 'none') {
      intent.filter = { style, start, end: end || duration };
    }

    // B. Speed
    // Distinguish "zoom 3x" vs "speed 3x" vs "3x" (default to speed if ambiguous?)
    // Logic: If 'zoom' word is in clause, treat 'x' as zoom factor.
    // If 'speed', 'fast', 'slow' is in clause, treat 'x' as speed factor.

    const hasZoom = text.includes('zoom') || text.includes('crop') || text.includes('punch');
    const hasSpeed = text.includes('speed') || text.includes('fast') || text.includes('slow') || text.includes('motion');

    const factorMatch = text.match(/(\d+(?:\.\d+)?)x/);
    let factor = null;
    if (factorMatch) factor = parseFloat(factorMatch[1]);

    if (hasSpeed) {
      let speedFactor = factor || 1.0;
      if (!factor) {
        if (text.includes('slow')) speedFactor = 0.5;
        if (text.includes('fast')) speedFactor = 2.0;
      }
      intent.videoFX = intent.videoFX || {};
      intent.videoFX.speed = { factor: speedFactor, start: start || 0, end: end || duration };
    }

    // C. Zoom
    if (hasZoom) {
      let zoomFactor = factor || 1.5;
      intent.videoFX = intent.videoFX || {};
      intent.videoFX.zoom = { factor: zoomFactor, start: start || 0, end: end || duration };
    }

    // D. Reverse
    if (text.includes('reverse') || text.includes('backwards')) {
      intent.videoFX = intent.videoFX || {};
      if (start !== null) {
        intent.videoFX.reverse = { start, end: end || duration };
      } else {
        intent.videoFX.reverse = true;
      }
    }

    // E. Remove/Cut
    // "remove", "cut out", "delete"
    if (text.includes('remove') || text.includes('cut') || text.includes('delete')) {
      if (start !== null && end !== null) {
        intent.videoFX = intent.videoFX || {};
        intent.videoFX.remove = { start, end };
      }
    }

    // F. Global Flags (Silence, Subtitles, Resize) - valid in any clause
    if (text.includes('silence')) intent.silenceRemoval = true;
    if (text.includes('subtitle') || text.includes('caption')) intent.subtitles = true;

    // Resize (Checked here, but sanitized globally later)
    if (text.includes('9:16') || text.includes('reel') || text.includes('tiktok') || text.includes('portrait')) intent.resize = '9:16';
    else if (text.includes('1:1') || text.includes('square') || text.includes('post') || text.includes('instagram')) intent.resize = '1:1';
    else if (text.includes('16:9') || text.includes('youtube') || text.includes('landscape')) intent.resize = '16:9';
    else if (text.includes('original')) intent.resize = 'original';

    return intent;
  };

  // Process Clauses
  for (const clause of clauses) {
    if (!clause.trim()) continue;
    const partial = parseClause(clause);

    // Merge
    if (partial.filter) response.filter = partial.filter;
    if (partial.resize) response.resize = partial.resize;
    if (partial.silenceRemoval) response.silenceRemoval = true;
    if (partial.subtitles) response.subtitles = true;

    if (partial.videoFX) {
      if (partial.videoFX.speed) response.videoFX.speed = partial.videoFX.speed;
      if (partial.videoFX.zoom) response.videoFX.zoom = partial.videoFX.zoom;
      if (partial.videoFX.remove) response.videoFX.remove = partial.videoFX.remove;
      if (partial.videoFX.reverse) response.videoFX.reverse = partial.videoFX.reverse;
    }
  }

  // Default Trim fallback ONLY if no effects and simple trim detected in full prompt
  // But clause-based is safer. If user said "trim from 0 to 10", parseClause didn't catch "trim" as specific action above (only text.match).
  // Let's check if we have a "bare" trim in any clause without other FX.

  if (!response.videoFX.speed && !response.videoFX.zoom && !response.videoFX.remove && !response.videoFX.reverse && response.filter.style === 'none') {
    // Check for standalone trim intent
    const simpleMatch = prompt.toLowerCase().match(/(?:trim|from) (\d+)(?:[^\d]|$)/);
    // Simpler: iterate clauses again? No, let's keep it simple.
    // If we have a time range but no FX, assign to trim?
    // Actually, let's look at the first clause for a "master trim".
    const firstClause = clauses[0];
    const rangeMatch = firstClause.match(/(?:from|starting|trim|between) (\d+):?(\d+)?(?:s)?\s*(?:to|until|-|and|&)\s*(\d+):?(\d+)?(?:s)?/);
    if (rangeMatch && !response.videoFX.speed) { // Avoid overwriting if speed/etc exists
      const s = parseTime(rangeMatch[1], rangeMatch[2]);
      const e = parseTime(rangeMatch[3], rangeMatch[4]);
      response.trim.start = s;
      response.trim.end = e;
    }
  }

  await new Promise(r => setTimeout(r, 500));
  return response;
}

module.exports = { parsePromptWithLLM, SYSTEM_PROMPT };
