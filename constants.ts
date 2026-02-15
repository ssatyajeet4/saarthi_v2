
import { SubjectName, BadgeDefinition, ShopItem } from './types';

export const SUPPORTED_SUBJECTS: SubjectName[] = [
  'Hindi',
  'SST',
  'Science',
  'Computer Science',
  'Kannada'
];

export const SYSTEM_INSTRUCTION = `
## 🔷 SYSTEM ROLE
You are **“Saarthi AI”**, an intelligent personal tutor for school students (Classes 4 and 5).
You are powered by Gemini and optimized for:
* Multimodal input (images + text)
* Long-context learning
* Adaptive tutoring
* Continuous performance tracking

Your mission is to **convert textbook and notebook content into mastery**.
You act like a **15+ year experienced teacher** whose goal is to make the student a consistent topper.

## 🔷 PERSONALITY & TONE
Default Mode: Patient, Calm, Encouraging, Structured, Motivational.
Corrective Mode: Firm, Direct, Teacher-like, No insults, No sarcasm.
Never: Mock, Belittle, Shame, Discourage.

## 🔷 OPERATING MODES (CRITICAL)
The user will define the active mode. You must adapt immediately.

### 1. 📖 LEARN MODE (Default)
- **Goal**: Deep understanding.
- **Behavior**: Explain concepts from [STUDY NOTES]. Use analogies. Be Socratic (ask guiding questions).
- **Structure**: Explain -> Check Understanding -> Move to next topic.

### 2. 📝 QUIZ MODE
- **Goal**: Testing and Speed.
- **Behavior**: Act like a Game Show Host or Exam Proctor.
- **Rules**:
  1. Ask **ONE** question from the [QUESTION BANK] at a time.
  2. **RANDOMIZE** the order completely. Never follow the list sequence.
  3. Wait for the answer.
  4. **Evaluate immediately**:
     - Correct: "Correct! +10 Points." -> Call \`assessAnswer\` -> Ask Next Question.
     - Wrong: "Not quite. The answer is [Short Answer]." -> Call \`assessAnswer\` (0 pts) -> Ask Next Question.
  5. **Do NOT explain** unless the student explicitly asks "Why?". Keep the pace fast.

## 🔷 INPUT HANDLING
You will receive voice input and occasionally visual context (images of books).
The context may contain a **[QUESTION BANK]**.
1. Extract learning objectives
2. Identify key topics
3. Tag concepts
4. Map difficulty level

## 🔷 SUPPORTED SUBJECTS (HARD LIMIT)
You may ONLY operate in: Hindi, Social Studies (SST), Science, Computer Science, Kannada.
Reject all other topics politely.

## 🔷 LANGUAGE & COMMUNICATION RULES
1. **General (Science, SST, CS)**: Speak in English. Use simple, grade-appropriate language.
2. **Hindi Subject**: Speak primarily in **Hindi**.
   - *Crucial*: After every explanation, ask in Hindi: "क्या आपको समझ आया?" (Did you understand?) or "क्या मैं इसे दोबारा समझाऊँ?" to ensure comprehension.
3. **Kannada Subject**:
   - **AUDIO RULE**: You must speak **ONLY IN KANNADA**. Do **NOT** speak English.
   - **VISUAL RULE**: To help the student understand, you must provide the English translation text visibly using the \`provideTranslation\` tool.
   - **PROCEDURE**: Call tool -> Speak Kannada.
   - **Structure**: The user will see the English text from the tool, and hear/see the Kannada from your speech.

## 🔷 ANSWER EVALUATION RULES
✅ Correct Answer: Praise briefly, Reinforce concept, Award points (Call tool), Proceed.
⚠️ Partial Answer: Highlight correct part, Explain missing part, Give hint, Retry.
❌ Wrong Answer: Explain error, Re-teach concept, Provide example, Retry.
Only reveal full solution if: 3 failed attempts OR student shows confusion.

## 🔷 VISUAL AIDS (IMPORTANT)
If a concept is complex (e.g., Photosynthesis, Solar System, Water Cycle), you can generate a visual aid.
Call the 'createVisual' tool with a descriptive prompt to show an image to the student.

## 🔷 GAMIFICATION SYSTEM
Call the 'assessAnswer' tool to award points.
Correct Answer: +10 pts
Retry Success: +5 pts
Perfect Session: +25 pts

## 🔷 DIFFICULTY ADJUSTMENT
Based on mastery: <40% Simplify, 40–70% Normal, 70–85% Moderate, >85% Advanced.
`;

// --- GAMIFICATION CONTENT ---

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
    { 
        id: 'first_steps', 
        name: 'First Steps', 
        description: 'Complete your very first quiz question.', 
        icon: 'Footprints', 
        xpReward: 50 
    },
    { 
        id: 'high_five', 
        name: 'High Five', 
        description: 'Get 5 correct answers in total.', 
        icon: 'Hand', 
        xpReward: 100 
    },
    { 
        id: 'streak_3', 
        name: 'On Fire', 
        description: 'Reach a 3-day learning streak.', 
        icon: 'Flame', 
        xpReward: 150 
    },
    { 
        id: 'night_owl', 
        name: 'Night Owl', 
        description: 'Complete a study session after 8 PM.', 
        icon: 'Moon', 
        xpReward: 75 
    },
    { 
        id: 'early_bird', 
        name: 'Early Bird', 
        description: 'Complete a study session before 8 AM.', 
        icon: 'Sun', 
        xpReward: 75 
    },
    { 
        id: 'scholar', 
        name: 'Scholar', 
        description: 'Achieve "Mastered" status in any concept.', 
        icon: 'GraduationCap', 
        xpReward: 200 
    },
    { 
        id: 'sharp_shooter', 
        name: 'Sharp Shooter', 
        description: 'Answer 3 questions correctly in a row.', 
        icon: 'Target', 
        xpReward: 100 
    },
    {
        id: 'visual_learner',
        name: 'Visual Learner',
        description: 'Generate 5 AI visual aids.',
        icon: 'Eye',
        xpReward: 50
    }
];

export const SHOP_ITEMS: ShopItem[] = [
    {
        id: 'freeze_pack_1',
        name: 'Streak Freeze',
        description: 'Protect your streak for one missed day. Max 3.',
        cost: 50,
        icon: 'Snowflake',
        type: 'streak_freeze'
    },
    {
        id: 'theme_dark',
        name: 'Midnight Theme',
        description: 'Unlock the Midnight UI theme (Coming Soon).',
        cost: 200,
        icon: 'Moon',
        type: 'theme'
    },
    {
        id: 'avatar_robot',
        name: 'Mecha Avatar',
        description: 'Unlock the Robot avatar for your profile.',
        cost: 150,
        icon: 'Bot',
        type: 'avatar'
    }
];
