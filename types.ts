
export type SubjectName = 'Hindi' | 'SST' | 'Science' | 'Computer Science' | 'Kannada';

export type DifficultyTier = 1 | 2 | 3 | 4 | 5; // 1=Basic, 5=Olympiad
export type MasteryState = 'Unknown' | 'Familiar' | 'Practicing' | 'Proficient' | 'Mastered';
export type PedagogicalStyle = 'Storyteller' | 'Socratic' | 'StepByStep' | 'Visual';

// PHASE 1: LEARNING ENGINE MODELS

export interface ConceptNode {
  id: string;
  name: string;
  subject: SubjectName;
  description: string;
  prerequisites: string[]; // IDs of other concepts
  difficultyTier: DifficultyTier;
  bloomsLevel: 'Remember' | 'Understand' | 'Apply' | 'Analyze';
  learningObjectives: string[];
}

export interface Question {
  id: string;
  question: string;
  answer: string; // Extracted or generated answer
  type: 'Short' | 'Long' | 'MCQ' | 'FillInTheBlank';
}

export interface ConceptMastery {
  conceptId: string;
  score: number; // 0.0 to 1.0
  state: MasteryState;
  lastStudiedAt: string; // ISO Date
  attempts: AttemptRecord[]; // Last 5 attempts
  decayFactor: number; // For spaced repetition
}

// Detailed Assessment Record
export interface AttemptRecord {
  id: string;
  timestamp: string;
  conceptId: string;
  questionText: string;
  isCorrect: boolean;
  timeTaken: number; // seconds
  hintsUsed: number; // 0 to 3
  confidence: number; // 0.0 to 1.0 (AI inferred)
}

export interface KnowledgeGraph {
  nodes: Record<string, ConceptNode>;
  edges: Array<{from: string, to: string, type: 'prerequisite'}>;
}

// PHASE 2: GAMIFICATION MODELS

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  xpReward: number;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  type: 'streak_freeze' | 'theme' | 'avatar';
}

export interface UserGamification {
  xp: number;
  level: number;
  coins: number;
  streak: {
    current: number;
    max: number;
    lastActivityDate: string;
    freezeInventory: number; // Power-up
  };
  badges: string[]; // Badge IDs
  unlockedNodes: string[]; // Concept IDs unlocked in Skill Tree
  inventory: string[]; // IDs of items owned (themes, avatars)
}

// DATA PERSISTENCE MODELS

export interface Chapter {
  id: string;
  name: string;
  subject: SubjectName;
  rawContent: string;
  questions: Question[]; // Extracted Q&A corpus
  graph: KnowledgeGraph; // AI Generated Graph
  createdAt: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  joinedAt: string;
  
  // Learning State
  masteryMap: Record<string, ConceptMastery>; // Key: ConceptID
  chapters: Record<string, Chapter>;
  assessmentHistory: AttemptRecord[]; // Full history of questions answered
  
  // Gamification State
  gamification: UserGamification;
  
  // Parent/Settings
  settings: {
    grade: number;
    parentPin: string;
    dailyGoal: number; // Minutes
  };
  
  activityLog: string[]; // YYYY-MM-DD
}

export interface GeneratedImage {
  id: string;
  concept: string;
  base64: string;
  createdAt: string;
  sizeBytes: number;
}
