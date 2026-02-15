
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
  const speedRatio = Math.max(0, 1 - (timeTaken / expectedTime - 1));
  const speedScore = Math.min(1, speedRatio); // Cap at 1

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
  conceptId: string
): ConceptMastery => {
  const now = new Date();
  
  if (!currentMastery) {
    return {
      conceptId,
      score: sessionScore * 0.5, // Initial confidence is lower
      state: mapScoreToState(sessionScore * 0.5),
      lastStudiedAt: now.toISOString(),
      attempts: [], // In a real DB we'd append, but for local storage we might truncate
      decayFactor: 1.0
    };
  }

  const lastStudied = new Date(currentMastery.lastStudiedAt);
  const daysSince = Math.max(0, (now.getTime() - lastStudied.getTime()) / (1000 * 3600 * 24));
  
  // 1. Apply Forgetting Curve Decay
  const retentionFactor = Math.exp(-DECAY_CONSTANT * daysSince);
  const decayedScore = currentMastery.score * retentionFactor;

  // 2. Update with new session score
  const newScore = decayedScore + LEARNING_RATE * (sessionScore - decayedScore);
  const finalScore = Math.min(1.0, Math.max(0.0, newScore));

  return {
    ...currentMastery,
    score: finalScore,
    state: mapScoreToState(finalScore),
    lastStudiedAt: now.toISOString(),
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
 * Determines the next difficulty tier based on mastery.
 * Architecture Phase 1.3
 */
export const recommendDifficulty = (mastery: ConceptMastery): DifficultyTier => {
  if (mastery.state === 'Mastered') return 5;
  if (mastery.state === 'Proficient') return 4;
  if (mastery.state === 'Practicing') return 3;
  if (mastery.state === 'Familiar') return 2;
  return 1;
};

/**
 * Determines which pedagogical style to use based on mastery.
 * Architecture Phase 3
 */
export const recommendPedagogy = (mastery?: ConceptMastery): 'Storyteller' | 'Socratic' | 'StepByStep' => {
  if (!mastery || mastery.score < 0.3) return 'Storyteller'; // Build intuition first
  if (mastery.score < 0.6) return 'StepByStep'; // Scaffolding
  return 'Socratic'; // Challenge them to think
};
