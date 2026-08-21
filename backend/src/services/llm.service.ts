import { z } from 'zod';
import { UrgencyLevel } from '@prisma/client';
import OpenAI from 'openai';

// Schema enforcing structured JSON response from LLM
export const llmAnalysisSchema = z.object({
  urgencyLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'Low', 'Medium', 'High']).transform((val) => {
    const upper = val.toUpperCase();
    if (upper === 'LOW') return UrgencyLevel.LOW;
    if (upper === 'MEDIUM') return UrgencyLevel.MEDIUM;
    return UrgencyLevel.HIGH;
  }),
  chiefComplaint: z.string().min(2, 'Chief complaint must be at least 2 characters'),
  suggestedQuestions: z.array(z.string()).min(1, 'At least 1 question required'),
});

export type LLMAnalysisResult = {
  urgencyLevel: UrgencyLevel;
  chiefComplaint: string;
  suggestedQuestions: string[];
};

/**
 * Clean helper to extract JSON block from markdown formatted responses (e.g. ```json ... ```).
 */
function extractJsonFromString(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}

/**
 * Local intelligent fallback symptom analyzer used when LLM API keys are not provided or API calls fail.
 */
function fallbackSymptomAnalyzer(symptoms: string): LLMAnalysisResult {
  const lower = symptoms.toLowerCase();
  let urgencyLevel: UrgencyLevel = UrgencyLevel.LOW;

  if (
    lower.includes('chest') ||
    lower.includes('shortness of breath') ||
    lower.includes('severe') ||
    lower.includes('bleeding') ||
    lower.includes('fainting')
  ) {
    urgencyLevel = UrgencyLevel.HIGH;
  } else if (
    lower.includes('fever') ||
    lower.includes('pain') ||
    lower.includes('vomiting') ||
    lower.includes('cough')
  ) {
    urgencyLevel = UrgencyLevel.MEDIUM;
  }

  return {
    urgencyLevel,
    chiefComplaint: symptoms.length > 100 ? `${symptoms.substring(0, 97)}...` : symptoms,
    suggestedQuestions: [
      'How long have you been experiencing these symptoms?',
      'Have you noticed any aggravating or relieving factors?',
      'Are you currently taking any medications for this condition?',
    ],
  };
}

/**
 * Analyzes raw symptoms submitted by a patient using OpenAI API or fallback engine.
 * Requires structured JSON output, validates with Zod, and retries once on malformed output.
 * If LLM call fails entirely, returns null so booking can still proceed safely.
 */
export async function analyzeSymptoms(symptoms: string): Promise<LLMAnalysisResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  // If no valid OpenAI API key is configured or key is default placeholder, use local analyzer
  if (!apiKey || apiKey.includes('your-openai-api-key') || apiKey.includes('sk-proj-your')) {
    console.log('ℹ️ OPENAI_API_KEY not configured. Utilizing local fallback symptom analyzer.');
    return fallbackSymptomAnalyzer(symptoms);
  }

  const openai = new OpenAI({ apiKey });
  const promptTemplate = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}`;

  const systemMessage = `You are a clinical intake AI assistant. You MUST respond with valid JSON matching this exact structure:
{
  "urgencyLevel": "Low" | "Medium" | "High",
  "chiefComplaint": "Concise summary of patient's main concern",
  "suggestedQuestions": ["Question 1 for doctor", "Question 2 for doctor", "Question 3 for doctor"]
}`;

  let attempts = 0;
  const maxAttempts = 2; // Initial attempt + 1 retry on malformed output

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: promptTemplate },
        ],
        temperature: 0.2,
      });

      const rawContent = response.choices[0]?.message?.content || '';
      const cleanJsonStr = extractJsonFromString(rawContent);

      const parsedJson = JSON.parse(cleanJsonStr);
      const validated = llmAnalysisSchema.parse(parsedJson);

      return validated;
    } catch (error: any) {
      console.warn(`⚠️ LLM Symptom Analysis Attempt ${attempts} failed:`, error.message);
      if (attempts >= maxAttempts) {
        console.error('❌ LLM Symptom Analysis failed after retry. Returning null for fallback.');
        return null;
      }
    }
  }

  return null;
}
