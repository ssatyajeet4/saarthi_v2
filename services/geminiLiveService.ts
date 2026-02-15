
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, pcmToAudioBuffer } from './audioUtils';
import { SYSTEM_INSTRUCTION } from '../constants';
import { updatePointsAndMastery } from './storageService';
import { SubjectName } from '../types';

// Tool Definition for updating progress
const updateProgressTool: FunctionDeclaration = {
  name: 'updateProgress',
  description: 'Update student points and concept mastery after an answer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING, description: 'Subject name (e.g. Science, Hindi)' },
      points: { type: Type.NUMBER, description: 'Points to award (10 for correct, 5 for retry)' },
      conceptName: { type: Type.STRING, description: 'Name of the concept practiced' },
      masteryIncrease: { type: Type.NUMBER, description: 'Percentage to increase mastery by (e.g. 10)' }
    },
    required: ['subject', 'points']
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
  private onStatusChange: (status: string) => void;
  private onToolCalled: () => void; // Callback to refresh UI
  private onTranscript: (text: string) => void; // Callback for text output
  private onVisualRequest: (prompt: string, concept: string) => void;
  private onFeedback: (type: 'correct' | 'wrong') => void;
  private currentTranscript = '';
  private currentStream: MediaStream | null = null;

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
    this.currentTranscript = ''; // Reset transcript on new connection
    this.onTranscript('');
    
    // 1. Initialize AudioContexts synchronously to bind to User Gesture
    if (!this.inputAudioContext) {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!this.outputAudioContext) {
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    // Resume immediately in case they are suspended (common in iOS/Safari)
    try {
        if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
        if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();
    } catch (e) {
        console.error("AudioContext Resume Error", e);
    }

    // 2. Check for Secure Context (HTTPS or localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.onStatusChange('HTTPS Required');
        console.error("MediaDevices API unavailable. App must be served over HTTPS or localhost.");
        return;
    }

    // 3. Request Mic Permission
    try {
        this.currentStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                autoGainControl: true,
                noiseSuppression: true
            } 
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
      finalSystemInstruction += `\n\nCURRENT SESSION CONTEXT (FROM UPLOADED CONTENT): ${initialContext}`;
    }

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
        outputAudioTranscription: {}, // Enable text transcription of the AI response
        systemInstruction: finalSystemInstruction,
        tools: [{ functionDeclarations: [updateProgressTool, createVisualTool, provideTranslationTool] }],
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    };

    // Connect
    try {
        this.sessionPromise = this.ai.live.connect(config);
    } catch (e) {
        console.error("Connection Error", e);
        this.onStatusChange('Connection Failed');
    }
  }

  private async handleOpen() {
    this.onStatusChange('Active');
    
    // Start Mic Stream using the pre-acquired stream
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
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    // 2. Handle Text Transcription
    if (message.serverContent?.outputTranscription?.text) {
        if (this.currentTranscript.endsWith("Kannada: ")) {
             // Already prepared
        } else if (this.currentTranscript.length > 0 && !this.currentTranscript.endsWith('\n')) {
            // this.currentTranscript += ' '; // Optional spacing
        }
        
        this.currentTranscript += message.serverContent.outputTranscription.text;
        this.onTranscript(this.currentTranscript);
    }

    // 3. Handle Tool Calls
    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            let result = 'Success';
            
            if (fc.name === 'updateProgress') {
                const { subject, points, conceptName, masteryIncrease } = fc.args as any;
                updatePointsAndMastery(subject as SubjectName, points, conceptName, masteryIncrease);
                this.onToolCalled();
                
                // Trigger Feedback Animation
                if (points >= 10) {
                    this.onFeedback('correct');
                } else {
                    this.onFeedback('wrong');
                }
                
                result = 'Progress updated successfully';
            } 
            else if (fc.name === 'createVisual') {
                const { prompt, concept } = fc.args as any;
                this.onVisualRequest(prompt as string, concept as string);
                result = 'Visual generation triggered';
            }
            else if (fc.name === 'provideTranslation') {
                const { englishText } = fc.args as any;
                const separator = this.currentTranscript.length > 0 ? '\n\n' : '';
                this.currentTranscript += `${separator}English: ${englishText}\nKannada: `;
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
    }
  }

  async disconnect() {
    if (this.cleanup) this.cleanup();
    
    // DO NOT CLOSE AudioContexts here if we want to reuse them or if closing them causes issues on re-connect.
    // However, clean closing is good practice. 
    // To be safe for re-connections: check state.
    
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
        try {
             // Just suspend instead of close to keep the context valid? 
             // No, standard practice is close. We re-create in connect().
            await this.inputAudioContext.close();
            this.inputAudioContext = null;
        } catch (e) {
            console.error("Error closing input context:", e);
        }
    }
    
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        try {
            await this.outputAudioContext.close();
            this.outputAudioContext = null;
        } catch (e) {
             console.error("Error closing output context:", e);
        }
    }
  }
}
