
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, pcmToAudioBuffer } from './audioUtils';
import { SYSTEM_INSTRUCTION } from '../constants';
import { logAssessment } from './storageService';
import { generateAdaptiveInstructions } from './learningEngine';
import { SubjectName } from '../types';

// Enhanced Tool: assessAnswer
const assessAnswerTool: FunctionDeclaration = {
  name: 'assessAnswer',
  description: 'Evaluate the student\'s answer to a question. Use this immediately after the student answers.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING, description: 'Subject name (e.g. Science)' },
      conceptName: { type: Type.STRING, description: 'The specific concept being tested' },
      questionText: { type: Type.STRING, description: 'The question that was asked' },
      isCorrect: { type: Type.BOOLEAN, description: 'True if the answer was substantially correct' },
      hintsUsed: { type: Type.NUMBER, description: 'Estimated number of hints given (0-3)' },
      confidence: { type: Type.NUMBER, description: 'Student confidence level inferred from voice (0.0 = unsure, 1.0 = confident)' }
    },
    required: ['subject', 'conceptName', 'questionText', 'isCorrect']
  }
};

// Tool Definition for generating visuals
const createVisualTool: FunctionDeclaration = {
  name: 'createVisual',
  description: 'Generate a visual diagram or illustration to help explain a concept.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: 'Description of the image to generate' },
      concept: { type: Type.STRING, description: 'The concept being illustrated' }
    },
    required: ['prompt', 'concept']
  }
};

// Tool Definition for providing translation text (Visual only, no audio)
const provideTranslationTool: FunctionDeclaration = {
  name: 'provideTranslation',
  description: 'Provide the English translation text for the user to read. Do not speak this text. Use this before speaking the Kannada response.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      englishText: { type: Type.STRING, description: 'The English text to display.' }
    },
    required: ['englishText']
  }
};

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private sessionPromise: Promise<any> | null = null;
  private nextStartTime = 0;
  private cleanup: (() => void) | null = null;
  
  // Callbacks
  private onStatusChange: (status: string) => void;
  private onToolCalled: () => void;
  private onTranscript: (text: string) => void;
  private onVisualRequest: (prompt: string, concept: string) => void;
  private onFeedback: (type: 'correct' | 'wrong') => void;
  
  // State
  private currentTranscript = '';
  private currentStream: MediaStream | null = null;
  
  // Timing State for Metrics
  private lastTurnEndTime: number = 0;

  constructor(
    apiKey: string, 
    onStatusChange: (s: string) => void, 
    onToolCalled: () => void,
    onTranscript: (text: string) => void,
    onVisualRequest: (prompt: string, concept: string) => void,
    onFeedback: (type: 'correct' | 'wrong') => void
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.onStatusChange = onStatusChange;
    this.onToolCalled = onToolCalled;
    this.onTranscript = onTranscript;
    this.onVisualRequest = onVisualRequest;
    this.onFeedback = onFeedback;
  }

  async connect(initialContext?: string) {
    this.onStatusChange('Connecting...');
    this.currentTranscript = ''; 
    this.onTranscript('');
    this.lastTurnEndTime = Date.now(); // Initialize timer
    
    // 1. Initialize AudioContexts synchronously
    if (!this.inputAudioContext) {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!this.outputAudioContext) {
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    try {
        if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
        if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();
    } catch (e) {
        console.error("AudioContext Resume Error", e);
    }

    // 2. Check Permissions & Devices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.onStatusChange('HTTPS Required');
        return;
    }

    try {
        this.currentStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true } 
        });
    } catch (e: any) {
        console.error("Mic Permission Denied", e);
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            this.onStatusChange('Permission Denied');
        } else {
            this.onStatusChange('Mic Error');
        }
        return;
    }

    // Config setup
    let finalSystemInstruction = SYSTEM_INSTRUCTION;
    if (initialContext) {
      finalSystemInstruction += `\n\nCURRENT SESSION CONTEXT (FROM UPLOADED CONTENT):\n${initialContext}`;
    }
    
    // Add specific instruction for using the new tool
    finalSystemInstruction += `\n\nIMPORTANT: Every time the student answers a question, you MUST call the 'assessAnswer' tool immediately to record their performance. Infer their confidence from their tone.`;

    const config = {
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: this.handleOpen.bind(this),
        onmessage: this.handleMessage.bind(this),
        onclose: () => this.onStatusChange('Disconnected'),
        onerror: (e: ErrorEvent) => {
            console.error(e);
            this.onStatusChange('Error');
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {}, 
        systemInstruction: finalSystemInstruction,
        tools: [{ functionDeclarations: [assessAnswerTool, createVisualTool, provideTranslationTool] }],
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    };

    try {
        this.sessionPromise = this.ai.live.connect(config);
    } catch (e) {
        console.error("Connection Error", e);
        this.onStatusChange('Connection Failed');
    }
  }

  private async handleOpen() {
    this.onStatusChange('Active');
    this.lastTurnEndTime = Date.now(); // Reset timer on start
    
    if (!this.inputAudioContext || !this.currentStream) return;
    
    try {
        const source = this.inputAudioContext.createMediaStreamSource(this.currentStream);
        const processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const blob = createPcmBlob(inputData);
            this.sessionPromise?.then(session => session.sendRealtimeInput({ media: blob }));
        };

        source.connect(processor);
        processor.connect(this.inputAudioContext.destination);

        this.cleanup = () => {
            source.disconnect();
            processor.disconnect();
            if (this.currentStream) {
                this.currentStream.getTracks().forEach(t => t.stop());
                this.currentStream = null;
            }
        };
    } catch (err) {
        console.error("Audio Processing Error", err);
        this.onStatusChange('Audio Error');
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.outputAudioContext) {
        const audioBytes = base64ToUint8Array(audioData);
        const audioBuffer = pcmToAudioBuffer(audioBytes, this.outputAudioContext);
        
        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputAudioContext.destination);
        
        // Track when this audio chunk finishes playing
        source.onended = () => {
             // We update the timer when the AI finishes speaking.
             // This is the "Start Time" for the user's next turn/thinking.
             this.lastTurnEndTime = Date.now(); 
        };
        
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    // 2. Handle Text Transcription
    if (message.serverContent?.outputTranscription?.text) {
        if (this.currentTranscript.endsWith("Kannada: ")) {
             // Already prepared
        } else if (this.currentTranscript.length > 0 && !this.currentTranscript.endsWith('\n')) {
            // this.currentTranscript += ' '; 
        }
        this.currentTranscript += message.serverContent.outputTranscription.text;
        this.onTranscript(this.currentTranscript);
    }

    // 3. Handle Tool Calls
    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            let result = 'Success';
            
            if (fc.name === 'assessAnswer') {
                const { subject, conceptName, questionText, isCorrect, hintsUsed, confidence } = fc.args as any;
                
                // --- METRIC CALCULATION ---
                // Calculate time taken since the AI finished speaking last.
                // We cap it at 60s to avoid skewed data if there was a pause.
                const rawTimeTaken = (Date.now() - this.lastTurnEndTime) / 1000;
                const timeTaken = Math.min(60, Math.max(1, rawTimeTaken));
                
                // Log detailed assessment
                const logResult = logAssessment(
                    subject, 
                    conceptName, 
                    questionText, 
                    isCorrect, 
                    timeTaken, 
                    hintsUsed || 0, 
                    confidence || 0.8
                );
                
                this.onToolCalled();

                // Generate Adaptive Instruction based on new mastery
                const adaptation = generateAdaptiveInstructions(logResult.mastery.score);
                
                result = `Assessment Logged. Time: ${timeTaken.toFixed(1)}s. Mastery: ${(logResult.mastery.score * 100).toFixed(0)}%. \nINSTRUCTION: ${adaptation}`;
                
                // Feedback
                if (isCorrect) {
                    this.onFeedback('correct');
                } else {
                    this.onFeedback('wrong');
                }
            } 
            else if (fc.name === 'createVisual') {
                const { prompt, concept } = fc.args as any;
                this.onVisualRequest(prompt as string, concept as string);
                result = 'Visual generation triggered';
            }
            else if (fc.name === 'provideTranslation') {
                const { englishText } = fc.args as any;
                this.currentTranscript += `\nEnglish: ${englishText}\nKannada: `;
                this.onTranscript(this.currentTranscript);
                result = 'Translation displayed';
            }

            this.sessionPromise?.then(session => {
                session.sendToolResponse({
                    functionResponses: {
                        id: fc.id,
                        name: fc.name,
                        response: { result: result }
                    }
                });
            });
        }
    }
    
    // 4. Handle Interruption
    if (message.serverContent?.interrupted) {
        this.nextStartTime = this.outputAudioContext?.currentTime || 0;
        this.lastTurnEndTime = Date.now(); // Reset timer on interruption
    }
  }

  async disconnect() {
    if (this.cleanup) this.cleanup();
    
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
        try { await this.inputAudioContext.close(); this.inputAudioContext = null; } catch (e) {}
    }
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        try { await this.outputAudioContext.close(); this.outputAudioContext = null; } catch (e) {}
    }
  }
}
