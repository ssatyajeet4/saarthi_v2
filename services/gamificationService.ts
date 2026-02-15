
import { UserGamification, StudentProfile, AttemptRecord } from '../types';
import { BADGE_DEFINITIONS, SHOP_ITEMS } from '../constants';

// --- CONSTANTS ---
const XP_PER_LEVEL_BASE = 100;
const LEVEL_EXPONENT = 1.5;

// --- CORE LOGIC ---

/**
 * Calculates XP required to reach the next level.
 * Formula: XP = 100 * (Level ^ 1.5)
 */
export const getXpForNextLevel = (currentLevel: number): number => {
  return Math.floor(XP_PER_LEVEL_BASE * Math.pow(currentLevel, LEVEL_EXPONENT));
};

/**
 * Calculates percentage progress to next level
 */
export const getLevelProgress = (xp: number, level: number): number => {
    const currentLevelXp = getXpForNextLevel(level - 1); // XP needed for current level
    const nextLevelXp = getXpForNextLevel(level); // XP needed for next level
    
    // XP gained in THIS level
    const xpInLevel = xp - currentLevelXp;
    const xpNeededForLevel = nextLevelXp - currentLevelXp;
    
    // Safety for level 1
    if (level === 1) return Math.min(100, (xp / nextLevelXp) * 100);
    
    return Math.min(100, (xpInLevel / xpNeededForLevel) * 100);
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
    newLevel++;
    threshold = getXpForNextLevel(newLevel);
    // Level Up Bonus
    state.coins += 50; 
  }

  return {
    ...state,
    xp: newXp,
    level: newLevel,
    coins: state.coins + (baseXp > 0 ? 2 : 0) // Small coin drip for activity
  };
};

/**
 * Calculates daily streak with support for "Streak Freeze".
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
    if (freezeInventory > 0) {
      // Saved by freeze (streak stays same, doesn't increment, but doesn't reset)
      // Actually, if they missed a day, and use a freeze, they keep the streak number but it applies to "today" effectively bridging the gap.
      return { streak: currentStreak, inventory: freezeInventory - 1, broken: false }; 
    } else {
      return { streak: 1, inventory: freezeInventory, broken: true }; // Reset to 1 (new start today)
    }
  }
};

/**
 * Checks all badge conditions against the profile and returns any NEW badges awarded.
 */
export const evaluateBadges = (profile: StudentProfile): string[] => {
    const newBadges: string[] = [];
    const ownedBadges = new Set(profile.gamification.badges);

    const history = profile.assessmentHistory || [];
    const correctCount = history.filter(h => h.isCorrect).length;
    const now = new Date();
    const hour = now.getHours();

    // 1. FIRST STEPS
    if (!ownedBadges.has('first_steps') && history.length > 0) {
        newBadges.push('first_steps');
    }

    // 2. HIGH FIVE (5 correct)
    if (!ownedBadges.has('high_five') && correctCount >= 5) {
        newBadges.push('high_five');
    }

    // 3. STREAK 3
    if (!ownedBadges.has('streak_3') && profile.gamification.streak.current >= 3) {
        newBadges.push('streak_3');
    }

    // 4. NIGHT OWL (After 8 PM)
    if (!ownedBadges.has('night_owl') && hour >= 20) {
        newBadges.push('night_owl');
    }

    // 5. EARLY BIRD (Before 8 AM)
    if (!ownedBadges.has('early_bird') && hour < 8) {
        newBadges.push('early_bird');
    }

    // 6. SCHOLAR (Mastered a concept)
    if (!ownedBadges.has('scholar')) {
        const hasMastery = Object.values(profile.masteryMap).some(m => m.state === 'Mastered');
        if (hasMastery) newBadges.push('scholar');
    }

    // 7. SHARP SHOOTER (3 Correct in a row)
    if (!ownedBadges.has('sharp_shooter') && history.length >= 3) {
        const last3 = history.slice(0, 3);
        if (last3.every(h => h.isCorrect)) {
            newBadges.push('sharp_shooter');
        }
    }

    return newBadges;
};

/**
 * Handles purchasing items from the shop.
 */
export const processPurchase = (
    gamification: UserGamification, 
    itemId: string
): { success: boolean, newState?: UserGamification, message: string } => {
    
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, message: "Item not found" };

    if (gamification.coins < item.cost) {
        return { success: false, message: "Not enough coins!" };
    }

    const newState = { ...gamification };
    newState.coins -= item.cost;

    if (item.type === 'streak_freeze') {
        if (newState.streak.freezeInventory >= 3) {
            return { success: false, message: "Max freeze inventory (3) reached." };
        }
        newState.streak.freezeInventory += 1;
    } else {
        // Generic inventory for avatars/themes
        if (newState.inventory.includes(itemId)) {
            return { success: false, message: "Item already owned." };
        }
        newState.inventory.push(itemId);
    }

    return { success: true, newState, message: `Purchased ${item.name}!` };
};
