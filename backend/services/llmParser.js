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

  if (!API_KEY || API_KEY.includes('your_')) {
    logger.warn('[LLM] No valid API KEY found in .env (LLM_API_KEY). Using Mock mode (Limited capabilities).');
    return parseMock(prompt, context);
  }

  try {
    if (PROVIDER === 'gemini') {
      return await callGemini(prompt, context);
    } else {
      return await callOpenAI(prompt, context);
    }
  } catch (error) {
    logger.error(`[LLM] Request failed: ${error.message}. Falling back to mock.`);
    return parseMock(prompt, context);
  }
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
  logger.info('[MockLLM] Using heuristic fallback.');
  const mockResponse = {
    swapAudio: null,
    trim: { start: null, end: null },
    silenceRemoval: false,
    subtitles: false,
    filter: { style: 'none', start: null, end: null },
    resize: null,
    videoFX: { reverse: false, speed: null, remove: null, zoom: null },
    export: 'mp4'
  };

  const p = prompt.toLowerCase();

  // Extract Duration from Context
  // Context format: "Video Context: Duration 172.06 seconds. Resolution 1280x720."
  let duration = 0;
  const durationMatch = context.match(/Duration (\d+(?:\.\d+)?) seconds/);
  if (durationMatch) {
    duration = parseFloat(durationMatch[1]);
  }

  const styles = ['cinematic', 'grayscale', 'sepia', 'retro', 'warm', 'cool', 'vibrant'];
  styles.forEach(style => {
    if (p.includes(style)) {
      mockResponse.filter.style = style;
    }
  });
  if (p.includes('black and white')) mockResponse.filter.style = 'grayscale';
  if (p.includes('old school') || p.includes('vintage')) mockResponse.filter.style = 'retro';
  if (p.includes('silence')) mockResponse.silenceRemoval = true;
  if (p.includes('subtitle') || p.includes('caption')) mockResponse.subtitles = true;

  // Resize / Aspect Ratio
  if (p.includes('9:16') || p.includes('reel') || p.includes('tiktok') || p.includes('short') || p.includes('portrait')) mockResponse.resize = '9:16';
  else if (p.includes('1:1') || p.includes('square') || p.includes('post') || p.includes('instagram')) mockResponse.resize = '1:1';
  else if (p.includes('16:9') || p.includes('youtube') || p.includes('landscape') || p.includes('tv') || p.includes('wide')) mockResponse.resize = '16:9';
  else if (p.includes('original') || p.includes('same size') || p.includes('no crop') || p.includes('full size')) mockResponse.resize = 'original';

  if (p.includes('reverse') || p.includes('backwards')) mockResponse.videoFX.reverse = true;

  // Improved Trim/Reverse Logic

  // Regex Patterns
  // 1. "trim/from X to Y" or "between X and Y"
  const rangeMatch = p.match(/(?:from|starting|trim|between) (\d+):?(\d+)?(?:s)?\s*(?:to|until|-|and|&)\s*(\d+):?(\d+)?(?:s)?/);

  // 2. "last X seconds"
  const lastMatch = p.match(/last (\d+)(?:s| seconds)?/);

  // 3. "first X seconds"
  const firstMatch = p.match(/(?:first|start) (\d+)(?:s| seconds)?/);

  let start = null;
  let end = null;

  // Helper to parse "MM:SS" or "SS"
  const parseTime = (m, s) => {
    if (s) return parseInt(m) * 60 + parseInt(s);
    return parseInt(m);
  };

  if (rangeMatch) {
    start = parseTime(rangeMatch[1], rangeMatch[2]);
    end = parseTime(rangeMatch[3], rangeMatch[4]);
  } else if (lastMatch && duration > 0) {
    const seconds = parseInt(lastMatch[1]);
    start = Math.max(0, duration - seconds);
    end = duration;
  } else if (firstMatch) {
    const seconds = parseInt(firstMatch[1]);
    start = 0;
    end = seconds;
  } else {
    // Fallback legacy
    const simpleMatch = p.match(/trim (?:first )?(\d+)/);
    if (simpleMatch) start = parseInt(simpleMatch[1]);
  }

  // Apply to Trim OR Reverse
  // Apply to Trim OR Reverse OR Filter (if style is set)
  if (start !== null) {
    if (mockResponse.videoFX.reverse) {
      // ... (Reverse logic) ...
      mockResponse.videoFX.reverse = { start, end: end || duration };
    } else if (mockResponse.filter.style !== 'none') {
      // Filter Timestamp Logic
      mockResponse.filter.start = start;
      mockResponse.filter.end = end || duration;
    } else {
      // Normal Trim Intent
      mockResponse.trim.start = start;
      mockResponse.trim.end = end;
    }
  }

  // Check for Speed Intent
  // "2x speed", "slow motion", "half speed", "speed up", "slow down"
  const speedMatch = p.match(/(\d+(?:\.\d+)?)x/); // e.g. "2x"
  const slowMatch = p.match(/(?:slow|motion)/);
  const fastMatch = p.match(/(?:fast|speed up)/);

  if (speedMatch || slowMatch || fastMatch) {
    let factor = 1.0;
    if (speedMatch) factor = parseFloat(speedMatch[1]);
    else if (slowMatch) factor = 0.5;
    else if (fastMatch) factor = 2.0;

    // Determine range
    let s = start !== null ? start : 0;
    let e = end !== null ? end : duration;

    if (s === 0 && e === 0 && duration > 0) e = duration;

    mockResponse.videoFX.speed = {
      factor: factor,
      start: s,
      end: e
    };

    // Clear trim if it was just inferred for the speed duration (unless it was explicitly a trim request)
    // Since this is a simple mock, we prioritize the speed effect over simple trim if both inferred from same text.
    if (start !== null && !mockResponse.videoFX.reverse) {
      mockResponse.trim.start = null;
      mockResponse.trim.end = null;
    }
  }

  // Check for Remove/Cut Intent
  // "remove between X and Y", "cut out X to Y", "delete from X to Y"
  const removeMatch = p.match(/(?:remove|cut|delete).*(?:from|between|starting)?.*?(\d+):?(\d+)?(?:s)?.*(?:to|and|until).*?(\d+):?(\d+)?(?:s)?/);

  if (removeMatch) {
    const s = parseTime(removeMatch[1], removeMatch[2]);
    const e = parseTime(removeMatch[3], removeMatch[4]);

    mockResponse.videoFX.remove = {
      start: s,
      end: e
    };

    // Clear trim if inferred
    if (start !== null) {
      mockResponse.trim.start = null;
      mockResponse.trim.end = null;
    }
  }

  // Zoom / Crop / Punch In logic
  if ((p.includes('zoom') || p.includes('crop') || p.includes('punch') || p.includes('close up'))) {
    // 1. Check for specific range
    // "zoom from 5s to 10s"
    let zStart = 0;
    let zEnd = duration;

    const zRange = p.match(/(?:from|between) (\d+):?(\d+)?(?:seconds|secs|sec|s)?\s*(?:to|and|-)\s*(\d+):?(\d+)?(?:seconds|secs|sec|s)?/);
    if (zRange) {
      zStart = parseTime(zRange[1], zRange[2]);
      zEnd = parseTime(zRange[3], zRange[4]);
    } else if (start !== null) {
      // Fallback to the general trim/time inference if specific zoom regex fails
      zStart = start;
      zEnd = end || duration;
      // Clear trim intent since it's actually a zoom
      mockResponse.trim.start = null;
      mockResponse.trim.end = null;
    }

    mockResponse.videoFX.zoom = { factor: 1.5, start: zStart, end: zEnd };
  }

  await new Promise(r => setTimeout(r, 500));
  return mockResponse;
}

module.exports = { parsePromptWithLLM, SYSTEM_PROMPT };
