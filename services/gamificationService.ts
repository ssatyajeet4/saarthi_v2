
import { UserGamification } from '../types';

// --- CONSTANTS ---
const XP_PER_LEVEL_BASE = 100;
const LEVEL_EXPONENT = 1.5;

// --- CORE LOGIC ---

/**
 * Calculates XP required to reach the next level.
 * Formula: XP = 100 * (Level ^ 1.5)
 * Architecture Phase 2.2
 */
export const getXpForNextLevel = (currentLevel: number): number => {
  return Math.floor(XP_PER_LEVEL_BASE * Math.pow(currentLevel, LEVEL_EXPONENT));
};

/**
 * Processes a learning action and returns updated gamification state.
 */
export const awardExperience = (
  state: UserGamification,
  baseXp: number,
  isPerfectStreak: boolean
): UserGamification => {
  let xpGain = baseXp;
  if (isPerfectStreak) xpGain += 5; // Micro-bonus

  let newXp = state.xp + xpGain;
  let newLevel = state.level;
  let threshold = getXpForNextLevel(newLevel);

  // Level Up Logic
  while (newXp >= threshold) {
    newXp -= threshold;
    newLevel++;
    threshold = getXpForNextLevel(newLevel);
    // Level Up Bonus
    state.coins += 50; 
  }

  return {
    ...state,
    xp: newXp,
    level: newLevel,
    coins: state.coins + (baseXp > 0 ? 10 : 0) // Coin per successful action
  };
};

/**
 * Calculates daily streak with support for "Streak Freeze".
 * Architecture Phase 2.3 & 5
 */
export const updateStreak = (
  currentStreak: number,
  lastActivityDate: string,
  freezeInventory: number
): { streak: number, inventory: number, broken: boolean } => {
  const today = new Date().toISOString().split('T')[0];
  if (lastActivityDate === today) return { streak: currentStreak, inventory: freezeInventory, broken: false };

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastActivityDate === yesterdayStr) {
    // Continuous
    return { streak: currentStreak + 1, inventory: freezeInventory, broken: false };
  } else {
    // Streak Broken logic
    // Check for Freeze
    if (freezeInventory > 0) {
      return { streak: currentStreak, inventory: freezeInventory - 1, broken: false }; // Saved by freeze
    } else {
      return { streak: 1, inventory: freezeInventory, broken: true }; // Reset to 1 (new start)
    }
  }
};
