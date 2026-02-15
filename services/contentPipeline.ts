
import { GoogleGenAI, Type } from '@google/genai';
import { Chapter, SubjectName, KnowledgeGraph, ConceptNode, Question } from '../types';

/**
 * Scalable Content Pipeline
 * Extracts Text + Structure (Knowledge Graph) + Questions from raw files.
 */
export const generateKnowledgeGraph = async (
  apiKey: string, 
  contentBase64: string, 
  mimeType: string
): Promise<Partial<Chapter>> => {
  
  const ai = new GoogleGenAI({ apiKey });

  // 1. Define strict schema for Graph + Content + QnA
  const pipelineSchema = {
    type: Type.OBJECT,
    properties: {
      subject: { 
        type: Type.STRING, 
        enum: ['Hindi', 'SST', 'Science', 'Computer Science', 'Kannada'],
        description: "The academic subject."
      },
      chapterName: { type: Type.STRING },
      fullText: { 
        type: Type.STRING, 
        description: "The complete lesson notes/text content. EXCLUDE the specific Q&A exercises from this field if possible." 
      },
      summary: { type: Type.STRING },
      concepts: {
        type: Type.ARRAY,
        description: "List of key concepts found in the chapter for the Knowledge Graph.",
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "Unique snake_case ID (e.g. 'solar_system')" },
            name: { type: Type.STRING, description: "Display name (e.g. 'Solar System')" },
            description: { type: Type.STRING, description: "Short definition (1 sentence)." },
            prerequisites: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "IDs of concepts that must be known before this one."
            }
          },
          required: ["id", "name", "description"]
        }
      },
      questions: {
        type: Type.ARRAY,
        description: "List of specific questions and answers found in the document (e.g., from 'Exercises', 'Q&A' sections).",
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            answer: { type: Type.STRING, description: "The answer provided in the text. If no answer is provided, generate a concise correct answer." },
            type: { type: Type.STRING, enum: ['Short', 'Long', 'MCQ', 'FillInTheBlank'] }
          },
          required: ["question", "answer", "type"]
        }
      }
    },
    required: ["subject", "chapterName", "fullText", "concepts", "summary", "questions"]
  };

  try {
    // 2. Call Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: contentBase64 } },
          { text: "Analyze this study material. 1) Extract the main lesson text into 'fullText'. 2) Identify key concepts. 3) EXTRACT specific Questions & Answers (from exercises, back of chapter) into the 'questions' array. Ensure questions are separated from the main notes." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: pipelineSchema
      }
    });

    const text = response.text;
    if (!text) return {};

    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanText);
    
    // 3. Transform into App Internal Graph Structure
    const graph: KnowledgeGraph = { nodes: {}, edges: [] };
    
    if (data.concepts && Array.isArray(data.concepts)) {
      data.concepts.forEach((c: any) => {
        const node: ConceptNode = {
          id: c.id,
          name: c.name,
          subject: data.subject as SubjectName,
          description: c.description,
          prerequisites: c.prerequisites || [],
          difficultyTier: 1, // Default
          bloomsLevel: 'Understand',
          learningObjectives: []
        };
        graph.nodes[c.id] = node;
        
        if (c.prerequisites) {
          c.prerequisites.forEach((preId: string) => {
             graph.edges.push({ from: preId, to: c.id, type: 'prerequisite' });
          });
        }
      });
    }

    // Transform Questions
    const questions: Question[] = [];
    if (data.questions && Array.isArray(data.questions)) {
      data.questions.forEach((q: any) => {
        questions.push({
          id: crypto.randomUUID(),
          question: q.question,
          answer: q.answer,
          type: q.type || 'Short'
        });
      });
    }

    return {
      subject: data.subject as SubjectName,
      name: data.chapterName,
      rawContent: data.fullText || data.summary,
      questions: questions,
      graph: graph
    };

  } catch (error) {
    console.error("Content Pipeline Error:", error);
    return {};
  }
};
