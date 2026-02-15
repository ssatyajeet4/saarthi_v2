
import { StudentProfile, ConceptMastery, UserGamification, GeneratedImage, Chapter, SubjectName, KnowledgeGraph, Question, AttemptRecord } from '../types';
import { updateMastery, calculateSessionScore } from './learningEngine';
import { awardExperience, evaluateBadges, processPurchase } from './gamificationService';
import { BADGE_DEFINITIONS } from '../constants';

const PROFILE_KEY = 'shiksha_v2_profile';
const IMAGES_KEY = 'shiksha_v2_images';

// Initial Gamification State
const INITIAL_GAME_STATE: UserGamification = {
  xp: 0,
  level: 1,
  coins: 0,
  streak: { current: 0, max: 0, lastActivityDate: '', freezeInventory: 1 },
  badges: [],
  unlockedNodes: [],
  inventory: []
};

const INITIAL_PROFILE: StudentProfile = {
  id: 'user_local',
  name: 'Saachi',
  joinedAt: new Date().toISOString(),
  masteryMap: {},
  chapters: {},
  assessmentHistory: [],
  gamification: INITIAL_GAME_STATE,
  settings: { grade: 4, parentPin: '1234', dailyGoal: 20 },
  activityLog: []
};

// --- READERS ---

export const getProfile = (): StudentProfile => {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return INITIAL_PROFILE;
    
    const parsed = JSON.parse(stored);
    // Migration checks
    if (!parsed.assessmentHistory) parsed.assessmentHistory = [];
    if (!parsed.gamification.inventory) parsed.gamification.inventory = [];
    
    return parsed;
  } catch (e) {
    console.error("Profile load failed", e);
    return INITIAL_PROFILE;
  }
};

export const getStoredImages = (): GeneratedImage[] => {
  try {
    const stored = localStorage.getItem(IMAGES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
};

// --- WRITERS ---

export const saveProfile = (profile: StudentProfile) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
};

export const saveStoredImage = (image: GeneratedImage) => {
  const images = getStoredImages();
  images.unshift(image);
  if (images.length > 50) images.pop(); // Cap at 50
  localStorage.setItem(IMAGES_KEY, JSON.stringify(images));
};

export const clearStoredImages = () => localStorage.removeItem(IMAGES_KEY);

// --- CONTENT MANAGEMENT ---

export const saveChapter = (chapter: Chapter) => {
  const profile = getProfile();
  profile.chapters[chapter.id] = chapter;
  saveProfile(profile);
};

export const saveUploadedChapter = (
  subject: SubjectName,
  name: string,
  summary: string,
  content: string,
  difficulty: string,
  graph?: KnowledgeGraph,
  questions: Question[] = []
) => {
  const chapter: Chapter = {
    id: crypto.randomUUID(),
    name,
    subject,
    rawContent: content,
    questions: questions,
    graph: graph || { nodes: {}, edges: [] },
    createdAt: new Date().toISOString()
  };
  saveChapter(chapter);
};

export const deleteChapter = (chapterId: string) => {
  const profile = getProfile();
  if (profile.chapters[chapterId]) {
    delete profile.chapters[chapterId];
    saveProfile(profile);
  }
};

// --- ASSESSMENT & LOGGING ---

/**
 * CORE LOGGING FUNCTION
 * Records a single question attempt, updates mastery, awards XP, and checks Badges.
 */
export const logAssessment = (
  subject: string,
  conceptName: string,
  questionText: string,
  isCorrect: boolean,
  timeTaken: number,
  hintsUsed: number,
  confidence: number
): { 
    mastery: ConceptMastery, 
    gamification: UserGamification, 
    newBadges: string[],
    levelUp: boolean
} => {
  const profile = getProfile();
  const conceptId = conceptName.toLowerCase().trim().replace(/\s+/g, '_');
  
  // 1. Create Attempt Record
  const attempt: AttemptRecord = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    conceptId,
    questionText,
    isCorrect,
    timeTaken,
    hintsUsed,
    confidence
  };

  // 2. Append to History (Keep max 1000 for local storage safety)
  profile.assessmentHistory.unshift(attempt);
  if (profile.assessmentHistory.length > 1000) profile.assessmentHistory.pop();

  // 3. Calculate Session Score (0.0 - 1.0)
  const sessionScore = calculateSessionScore(isCorrect, timeTaken, 10, hintsUsed);

  // 4. Update Mastery
  const currentMastery = profile.masteryMap[conceptId];
  const newMastery = updateMastery(currentMastery, sessionScore, conceptId, attempt);
  profile.masteryMap[conceptId] = newMastery;

  // 5. Award Gamification Points & Check Level Up
  // Logic: Base 10 for correct, 2 for attempt.
  const points = isCorrect ? 10 : 2;
  const oldLevel = profile.gamification.level;
  const newGamification = awardExperience(profile.gamification, points, isCorrect && hintsUsed === 0);
  const levelUp = newGamification.level > oldLevel;
  profile.gamification = newGamification;

  // 6. Check for New Badges
  const newBadgeIds = evaluateBadges(profile);
  if (newBadgeIds.length > 0) {
      profile.gamification.badges.push(...newBadgeIds);
      // Award XP for badges
      newBadgeIds.forEach(bid => {
          const def = BADGE_DEFINITIONS.find(b => b.id === bid);
          if (def) profile.gamification.xp += def.xpReward;
      });
  }

  // 7. Log Daily Activity
  const today = new Date().toISOString().split('T')[0];
  if (!profile.activityLog.includes(today)) {
    profile.activityLog.push(today);
    profile.gamification.streak.current += 1;
  }

  saveProfile(profile);

  return { mastery: newMastery, gamification: profile.gamification, newBadges: newBadgeIds, levelUp };
};

// --- SHOP ACTIONS ---

export const buyShopItem = (itemId: string): { success: boolean, message: string } => {
    const profile = getProfile();
    const result = processPurchase(profile.gamification, itemId);
    
    if (result.success && result.newState) {
        profile.gamification = result.newState;
        saveProfile(profile);
    }
    
    return { success: result.success, message: result.message };
};
