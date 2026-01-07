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
  "filter": "cinematic" | "grayscale" | "none",
  "resize": "9:16" | "1:1" | "16:9" | null,
  "export": "mp4"
}
  "videoFX": {
    "reverse": boolean
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
    filter: 'none',
    resize: null,
    videoFX: { reverse: false },
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

  if (p.includes('cinematic')) mockResponse.filter = 'cinematic';
  if (p.includes('grayscale')) mockResponse.filter = 'grayscale';
  if (p.includes('silence')) mockResponse.silenceRemoval = true;
  if (p.includes('subtitle') || p.includes('caption')) mockResponse.subtitles = true;
  if (p.includes('9:16') || p.includes('reel') || p.includes('short')) mockResponse.resize = '9:16';
  if (p.includes('1:1') || p.includes('square')) mockResponse.resize = '1:1';
  if (p.includes('16:9') || p.includes('landscape')) mockResponse.resize = '16:9';
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
  if (start !== null) {
    if (mockResponse.videoFX.reverse) {
      // In-Place Reverse Intent
      mockResponse.videoFX.reverse = { start, end: end || duration }; // Default end to duration if not set (though regex usually catches pair)
      // Do NOT set trim, so we maintain context.
    } else {
      // Normal Trim Intent
      mockResponse.trim.start = start;
      mockResponse.trim.end = end;
    }
  }

  await new Promise(r => setTimeout(r, 500));
  return mockResponse;
}

module.exports = { parsePromptWithLLM, SYSTEM_PROMPT };
