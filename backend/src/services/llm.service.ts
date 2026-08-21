import { z } from 'zod';
import { UrgencyLevel } from '@prisma/client';
import OpenAI from 'openai';

// Schema enforcing structured JSON response from LLM for Symptom Intake
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

// Schema enforcing structured JSON response for Post-Visit Summarizer
export const llmPostVisitSchema = z.object({
  patientSummary: z.string().min(5, 'Patient summary must be at least 5 characters'),
  medications: z.array(z.object({
    name: z.string().min(1),
    dosage: z.string().min(1),
    frequency: z.string().min(1),
    durationDays: z.number().int().optional().default(7),
  })).optional().default([]),
  followUpSteps: z.array(z.string()).optional().default([]),
});

export type LLMPostVisitResult = {
  patientSummary: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    durationDays: number;
  }>;
  followUpSteps: string[];
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
 * Local fallback post-visit summarizer used when LLM API calls fail or no key is provided.
 */
function fallbackPostVisitSummarizer(notes: string): LLMPostVisitResult {
  const lower = notes.toLowerCase();
  const medications: Array<{ name: string; dosage: string; frequency: string; durationDays: number }> = [];

  if (lower.includes('amoxicillin')) {
    medications.push({ name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily (TID)', durationDays: 7 });
  } else if (lower.includes('ibuprofen')) {
    medications.push({ name: 'Ibuprofen', dosage: '400mg', frequency: 'Every 8 hours as needed for pain', durationDays: 5 });
  } else if (lower.includes('paracetamol') || lower.includes('acetaminophen')) {
    medications.push({ name: 'Paracetamol', dosage: '500mg', frequency: 'Every 6 hours as needed for fever', durationDays: 5 });
  }

  return {
    patientSummary: `Thank you for your visit today. Your doctor has evaluated your condition: "${notes}". Please follow the prescribed care plan, take any prescribed medications as directed, and contact the clinic if your symptoms do not improve.`,
    medications,
    followUpSteps: [
      'Take prescribed medications at regular intervals.',
      'Get adequate rest and maintain hydration.',
      'Contact clinic or schedule a follow-up if symptoms persist after 5 days.',
    ],
  };
}

/**
 * Analyzes raw symptoms submitted by a patient using OpenAI API or fallback engine.
 */
export async function analyzeSymptoms(symptoms: string): Promise<LLMAnalysisResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;

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
  const maxAttempts = 2;

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
      return llmAnalysisSchema.parse(parsedJson);
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

/**
 * Converts clinical doctor notes into a patient-friendly summary with medication schedule.
 * Prompt template: "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"
 */
export async function generatePostVisitSummary(doctorNotes: string): Promise<LLMPostVisitResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.includes('your-openai-api-key') || apiKey.includes('sk-proj-your')) {
    console.log('ℹ️ OPENAI_API_KEY not configured. Utilizing local fallback post-visit summarizer.');
    return fallbackPostVisitSummarizer(doctorNotes);
  }

  const openai = new OpenAI({ apiKey });
  const promptTemplate = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${doctorNotes}`;

  const systemMessage = `You are a clinical communications AI assistant. You MUST respond with valid JSON matching this exact structure:
{
  "patientSummary": "Clear, empathetic explanation of diagnosis and care plan written directly to the patient",
  "medications": [
    {
      "name": "Medication Name",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "durationDays": 7
    }
  ],
  "followUpSteps": ["Follow-up instruction 1", "Follow-up instruction 2"]
}`;

  let attempts = 0;
  const maxAttempts = 2;

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
      return llmPostVisitSchema.parse(parsedJson);
    } catch (error: any) {
      console.warn(`⚠️ LLM Post-Visit Summary Attempt ${attempts} failed:`, error.message);
      if (attempts >= maxAttempts) {
        console.error('❌ LLM Post-Visit Summary failed after retry. Returning null for fallback.');
        return null;
      }
    }
  }

  return null;
}
