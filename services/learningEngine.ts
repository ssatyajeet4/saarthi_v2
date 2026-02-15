
import { AttemptRecord, ConceptMastery, DifficultyTier, MasteryState } from '../types';

// --- CONSTANTS ---
const DECAY_CONSTANT = 0.1; // Rate of forgetting
const LEARNING_RATE = 0.3; // How fast new sessions impact global score
const MASTERY_THRESHOLDS = {
  UNKNOWN: 0.1,
  FAMILIAR: 0.4,
  PRACTICING: 0.7,
  PROFICIENT: 0.9,
  MASTERED: 1.0
};

// --- CORE LOGIC ---

/**
 * Calculates the score for a single session based on accuracy, speed, and independence.
 * Architecture Phase 1.2
 */
export const calculateSessionScore = (
  isCorrect: boolean,
  timeTaken: number,
  expectedTime: number,
  hintsUsed: number
): number => {
  const ALPHA = 0.6; // Accuracy weight
  const BETA = 0.2;  // Speed weight
  const GAMMA = 0.2; // Independence weight

  const accuracyScore = isCorrect ? 1.0 : 0.0;
  
  // Speed penalty: If time > expected, score drops. Max penalty 0.
  // Assuming expected time is roughly 10 seconds for oral quiz
  const safeExpected = expectedTime || 10;
  const speedRatio = Math.max(0, 1 - ((timeTaken - safeExpected) / safeExpected));
  const speedScore = Math.min(1, speedRatio); 

  // Hint penalty: -0.25 per hint
  const independenceScore = Math.max(0, 1 - (hintsUsed * 0.25));

  return (accuracyScore * ALPHA) + (speedScore * BETA) + (independenceScore * GAMMA);
};

/**
 * Updates the global mastery score using a Moving Average with Decay.
 * Architecture Phase 1.2 & 5 (Spaced Repetition)
 */
export const updateMastery = (
  currentMastery: ConceptMastery | undefined,
  sessionScore: number,
  conceptId: string,
  newAttempt: AttemptRecord
): ConceptMastery => {
  const now = new Date();
  
  // Initialize if new
  const baseMastery: ConceptMastery = currentMastery || {
    conceptId,
    score: 0.1, 
    state: 'Unknown',
    lastStudiedAt: now.toISOString(),
    attempts: [],
    decayFactor: 1.0
  };

  const lastStudied = new Date(baseMastery.lastStudiedAt);
  const daysSince = Math.max(0, (now.getTime() - lastStudied.getTime()) / (1000 * 3600 * 24));
  
  // 1. Apply Forgetting Curve Decay
  const retentionFactor = Math.exp(-DECAY_CONSTANT * daysSince);
  const decayedScore = baseMastery.score * retentionFactor;

  // 2. Update with new session score
  const newScore = decayedScore + LEARNING_RATE * (sessionScore - decayedScore);
  const finalScore = Math.min(1.0, Math.max(0.0, newScore));

  // 3. Update Attempts List (Keep last 5)
  const updatedAttempts = [newAttempt, ...baseMastery.attempts].slice(0, 5);

  return {
    ...baseMastery,
    score: finalScore,
    state: mapScoreToState(finalScore),
    lastStudiedAt: now.toISOString(),
    attempts: updatedAttempts,
    decayFactor: retentionFactor
  };
};

const mapScoreToState = (score: number): MasteryState => {
  if (score < MASTERY_THRESHOLDS.UNKNOWN) return 'Unknown';
  if (score < MASTERY_THRESHOLDS.FAMILIAR) return 'Familiar';
  if (score < MASTERY_THRESHOLDS.PRACTICING) return 'Practicing';
  if (score < MASTERY_THRESHOLDS.PROFICIENT) return 'Proficient';
  return 'Mastered';
};

/**
 * DYNAMIC ENGINE CORE
 * Generates specific prompt instructions for the AI based on the learner's current mastery.
 */
export const generateAdaptiveInstructions = (masteryLevel: number): string => {
  const percentage = (masteryLevel * 100).toFixed(0);
  
  if (masteryLevel < 0.3) {
    return `[ADAPTIVE STRATEGY: NOVICE (Mastery: ${percentage}%)]
    - ROLE: Patient Storyteller.
    - INSTRUCTION: The student is a beginner. Explain concepts using simple stories and daily life analogies. Avoid jargon.
    - CHECKING: Ask "Did you understand?" frequently.
    - FEEDBACK: Celebrate every small attempt. Be very encouraging.`;
  } else if (masteryLevel < 0.7) {
    return `[ADAPTIVE STRATEGY: APPRENTICE (Mastery: ${percentage}%)]
    - ROLE: Socratic Coach.
    - INSTRUCTION: The student has basics but needs practice. Do not give answers immediately. Ask guiding questions like "Why do you think that?" or "What happens next?".
    - PACING: Moderate.
    - FEEDBACK: Gently correct errors by hinting at the logic, not just the fact.`;
  } else {
    return `[ADAPTIVE STRATEGY: EXPERT (Mastery: ${percentage}%)]
    - ROLE: Challenger / Peer.
    - INSTRUCTION: The student is proficient. Challenge them with "What if" scenarios, edge cases, or multi-step problems. Be concise and fast.
    - PACING: Fast-paced.
    - FEEDBACK: Minimal and precise. Focus on optimization and deeper understanding.`;
  }
};

// --- ANALYTICS CALCULATOR ---

export interface AnalyticsSummary {
  accuracy: number; // percentage
  avgTime: number; // seconds
  avgConfidence: number; // 0-1
  totalQuestions: number;
}

export const calculateAnalytics = (history: AttemptRecord[]): AnalyticsSummary => {
  if (!history || history.length === 0) {
    return { accuracy: 0, avgTime: 0, avgConfidence: 0, totalQuestions: 0 };
  }

  const total = history.length;
  const correct = history.filter(h => h.isCorrect).length;
  const totalTime = history.reduce((acc, h) => acc + h.timeTaken, 0);
  const totalConf = history.reduce((acc, h) => acc + (h.confidence || 0.5), 0);

  return {
    accuracy: Math.round((correct / total) * 100),
    avgTime: parseFloat((totalTime / total).toFixed(1)),
    avgConfidence: parseFloat((totalConf / total).toFixed(2)),
    totalQuestions: total
  };
};
