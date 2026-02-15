
import { StudentProfile, ConceptMastery, UserGamification, GeneratedImage, Chapter, SubjectName, KnowledgeGraph, Question } from '../types';
import { updateMastery } from './learningEngine';
import { awardExperience } from './gamificationService';

const PROFILE_KEY = 'shiksha_v2_profile';
const IMAGES_KEY = 'shiksha_v2_images';

// Initial Gamification State
const INITIAL_GAME_STATE: UserGamification = {
  xp: 0,
  level: 1,
  coins: 0,
  streak: { current: 0, max: 0, lastActivityDate: '', freezeInventory: 1 },
  badges: [],
  unlockedNodes: []
};

const INITIAL_PROFILE: StudentProfile = {
  id: 'user_local',
  name: 'Saachi',
  joinedAt: new Date().toISOString(),
  masteryMap: {},
  chapters: {},
  gamification: INITIAL_GAME_STATE,
  settings: { grade: 4, parentPin: '1234', dailyGoal: 20 },
  activityLog: []
};

// --- READERS ---

export const getProfile = (): StudentProfile => {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return INITIAL_PROFILE;
    return JSON.parse(stored);
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

// --- MASTERY & GAMIFICATION UPDATES ---

export const updateMasteryRecord = (mastery: ConceptMastery) => {
  const profile = getProfile();
  profile.masteryMap[mastery.conceptId] = mastery;
  saveProfile(profile);
};

export const updateGamification = (gameState: UserGamification) => {
  const profile = getProfile();
  profile.gamification = gameState;
  saveProfile(profile);
};

export const logActivity = () => {
  const profile = getProfile();
  const today = new Date().toISOString().split('T')[0];
  if (!profile.activityLog.includes(today)) {
    profile.activityLog.push(today);
  }
  saveProfile(profile);
};

// --- AI TOOL CALLBACKS ---

export const updatePointsAndMastery = (
  subject: SubjectName,
  points: number,
  conceptName: string,
  masteryIncrease: number
) => {
  const profile = getProfile();
  
  // 1. Update Gamification
  const newGamification = awardExperience(profile.gamification, points, false);
  profile.gamification = newGamification;
  
  // 2. Update Mastery
  const conceptId = conceptName.toLowerCase().trim().replace(/\s+/g, '_');
  
  // Logic: 10 points = Correct (1.0), 5 points = Retry (0.7), else 0.0
  const sessionScore = points >= 10 ? 1.0 : (points >= 5 ? 0.7 : 0.0);
  
  const currentMastery = profile.masteryMap[conceptId];
  const newMastery = updateMastery(currentMastery, sessionScore, conceptId);
  profile.masteryMap[conceptId] = newMastery;
  
  // Log activity
  const today = new Date().toISOString().split('T')[0];
  if (!profile.activityLog.includes(today)) {
    profile.activityLog.push(today);
    // Simple streak increment for now, ideally use updateStreak service
    profile.gamification.streak.current += 1; 
  }
  
  saveProfile(profile);
};
