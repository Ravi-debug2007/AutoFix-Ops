import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { ErrorEvent, Diagnosis } from '../src/types';
import { validateUnifiedDiff } from '../src/lib/diffValidator';

// Lazy client initialization to guard against missing secrets at module load
let genAiClient: GoogleGenAI | null = null;

function getGenAiClient(): GoogleGenAI {
  if (!genAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured in environment or Secret Manager.'
      );
    }
    genAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAiClient;
}

/**
 * Prompt Construction Logic (Separated from API-call mechanics)
 */
export function buildDiagnosisPrompt(event: ErrorEvent): string {
  return `You are an expert autonomous software engineer diagnosing an incident in repository "${event.repository || 'unknown-repo'}".

Error Event Details:
- Error Type: ${event.errorType}
- Target File: ${event.normalizedFilePath || 'Unknown file'}
- Line Number: ${event.lineNumber ?? 'Unknown'}
- Error Message: ${event.message}

Stack Trace:
\`\`\`
${event.stackTrace || 'No stack trace provided'}
\`\`\`

Analyze this error thoroughly with deep reasoning:
1. Identify the exact root cause of the error.
2. Formulate a precise, production-grade fix strategy.
3. Assess your confidence level ('high', 'medium', or 'low').

Output MUST strictly conform to the requested JSON schema.`;
}

export function buildPatchPrompt(event: ErrorEvent, diagnosis: Diagnosis): string {
  return `You are an automated patching engineer. Given this diagnosed bug, generate a production-ready unified diff.

Target Repository: ${event.repository || 'application'}
Target File: ${event.normalizedFilePath || 'src/index.ts'}
Error Type: ${event.errorType}
Message: ${event.message}

Diagnosis Root Cause:
${diagnosis.rootCause}

Proposed Fix Strategy:
${diagnosis.proposedFix}

Requirements:
- Output ONLY a valid Unified Diff format (starting with '--- a/...' and '+++ b/...', with hunk headers like '@@ -start,len +start,len @@').
- Do not output conversational explanations or wrap with text outside the diff.
- The diff must be syntactically valid and apply cleanly.`;
}

const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

/**
 * Step 4: Diagnosis Execution using Gemini with structured JSON output and automatic fallback
 */
export async function runDiagnosis(event: ErrorEvent): Promise<Diagnosis> {
  const ai = getGenAiClient();
  const prompt = buildDiagnosisPrompt(event);

  const diagnosisSchema = {
    type: Type.OBJECT,
    properties: {
      rootCause: {
        type: Type.STRING,
        description: 'Detailed explanation of why this error occurred.',
      },
      proposedFix: {
        type: Type.STRING,
        description: 'Concrete code modification plan to eliminate the bug.',
      },
      confidence: {
        type: Type.STRING,
        enum: ['high', 'medium', 'low'],
        description: 'Confidence rating of the proposed diagnosis and fix.',
      },
    },
    required: ['rootCause', 'proposedFix', 'confidence'],
  };

  const attemptGeneration = async (model: string, systemInstruction: string) => {
    return await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: diagnosisSchema,
      },
    });
  };

  // Attempt with primary model first
  try {
    const response = await attemptGeneration(
      PRIMARY_MODEL,
      'You are a principal software reliability engineer diagnosing production errors. Output strictly valid JSON conforming to the schema.'
    );

    const text = response.text?.trim() || '';
    const parsed = JSON.parse(text);
    if (!parsed.rootCause || !parsed.proposedFix || !parsed.confidence) {
      throw new Error('Diagnosis response missing required fields.');
    }

    return {
      rootCause: parsed.rootCause,
      proposedFix: parsed.proposedFix,
      confidence: parsed.confidence,
      timestamp: new Date().toISOString(),
    };
  } catch (err1: unknown) {
    console.warn(`Primary diagnosis with ${PRIMARY_MODEL} encountered an issue:`, err1);
    const errString = err1 instanceof Error ? err1.message : String(err1);

    // If quota/rate limit error or validation error, try fallback model
    try {
      console.log(`[Gemini] Attempting fallback diagnosis with ${FALLBACK_MODEL}`);
      const fallbackResponse = await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a principal software reliability engineer diagnosing production errors. Output strictly valid JSON conforming to the schema.',
          responseMimeType: 'application/json',
          responseSchema: diagnosisSchema,
        },
      });

      const text2 = fallbackResponse.text?.trim() || '';
      const parsed2 = JSON.parse(text2);
      if (!parsed2.rootCause || !parsed2.proposedFix || !parsed2.confidence) {
        throw new Error('Fallback response missing required fields.');
      }

      return {
        rootCause: parsed2.rootCause,
        proposedFix: parsed2.proposedFix,
        confidence: parsed2.confidence,
        timestamp: new Date().toISOString(),
      };
    } catch (err2: unknown) {
      const err2String = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(
        `AI diagnosis failed: Primary error: ${errString}. Fallback error: ${err2String}`
      );
    }
  }
}

/**
 * Step 5: Patch Generation using Gemini with automatic fallback
 */
export async function runPatchGeneration(
  event: ErrorEvent,
  diagnosis: Diagnosis
): Promise<string> {
  const ai = getGenAiClient();
  const prompt = buildPatchPrompt(event, diagnosis);

  const attemptPatch = async (model: string, useThinking = true) => {
    const config: any = {
      systemInstruction:
        'You are an automated code patch generator. Output ONLY a valid Unified Diff starting with --- a/ and +++ b/. Do not output markdown fences or conversational explanations.',
    };
    if (useThinking) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config,
    });

    const diffText = response.text?.trim() || '';
    // Strip markdown code fences if model accidentally added them
    const cleanDiff = diffText
      .replace(/^```diff\s*/i, '')
      .replace(/^```unified\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const validation = validateUnifiedDiff(cleanDiff);
    if (!validation.isValid) {
      throw new Error(`Generated patch is not a valid Unified Diff: ${validation.error}`);
    }

    return cleanDiff;
  };

  try {
    return await attemptPatch(PRIMARY_MODEL, true);
  } catch (err1: unknown) {
    console.warn(`Primary patch generation with ${PRIMARY_MODEL} failed:`, err1);
    try {
      console.log(`[Gemini] Attempting fallback patch generation with ${FALLBACK_MODEL}`);
      return await attemptPatch(FALLBACK_MODEL, false);
    } catch (err2: unknown) {
      throw new Error(
        `Failed to generate unified diff patch: ${err2 instanceof Error ? err2.message : String(err2)}`
      );
    }
  }
}
