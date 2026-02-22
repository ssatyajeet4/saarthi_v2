
import React, { useState, useRef, useEffect } from 'react';
import { GeminiLiveService } from '../services/geminiLiveService';
import { saveUploadedChapter, saveStoredImage, getProfile } from '../services/storageService';
import { generateKnowledgeGraph } from '../services/contentPipeline';
import { generateAdaptiveInstructions } from '../services/learningEngine';
import AudioVisualizer from '../components/AudioVisualizer';
import { GoogleGenAI } from '@google/genai';
import { Mic, MicOff, X, Sparkles, Loader2, Camera, HelpCircle, RefreshCcw, BookOpen, GraduationCap, Eye, AlertTriangle, Network, ListChecks, Brain, Trophy, Star } from 'lucide-react';
import { GeneratedImage, KnowledgeGraph, Question } from '../types';
import { useLocation } from 'react-router-dom';

const TutorSession: React.FC = () => {
  const [apiKey] = useState(process.env.API_KEY || '');
  const [status, setStatus] = useState('Idle');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [extractedContext, setExtractedContext] = useState('');
  const [mode, setMode] = useState<'learn' | 'quiz'>('learn');
  
  // UI State for Active Learning Context
  const [activeSource, setActiveSource] = useState<{
      title: string, 
      subtitle: string, 
      type: 'chapter' | 'upload', 
      rawContent?: string,
      questions?: Question[],
      graph?: KnowledgeGraph
  } | null>(null);
  
  const [analyzingContent, setAnalyzingContent] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [showContentModal, setShowContentModal] = useState(false);

  // Generated Visual State
  const [generatedVisual, setGeneratedVisual] = useState<GeneratedImage | null>(null);
  const [generatingVisual, setGeneratingVisual] = useState(false);

  // Graffiti Feedback State
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | null>(null);
  
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Helper to format context based on Mode and Mastery
  const buildContextString = (
      subject: string, 
      name: string, 
      notes: string, 
      questions: Question[], 
      graph: KnowledgeGraph | undefined,
      activeMode: 'learn' | 'quiz'
  ) => {
      // 1. Calculate Average Mastery for this Content
      const profile = getProfile();
      let totalScore = 0;
      let count = 0;
      
      if (graph && graph.nodes) {
          Object.keys(graph.nodes).forEach(nodeId => {
              const m = profile.masteryMap[nodeId];
              if (m) {
                  totalScore += m.score;
                  count++;
              }
          });
      }
      // If no specific nodes, we default to 0 (Novice)
      const avgMastery = count > 0 ? totalScore / count : 0;
      const adaptiveInstruction = generateAdaptiveInstructions(avgMastery);

      // 2. Build Context
      let context = `Subject: ${subject}.\nChapter: ${name}.\n`;
      context += `CURRENT OPERATING MODE: ${activeMode === 'quiz' ? 'QUIZ MODE' : 'LEARN MODE'}.\n`;
      
      // Inject Dynamic Adaptation
      context += `\n${adaptiveInstruction}\n\n`;
      
      if (activeMode === 'quiz') {
          context += `INSTRUCTION: You are in QUIZ MODE. Do not lecture. Ask questions from the [QUESTION BANK] below randomly. Keep it fast. If no questions are provided, generate your own based on the subject.\n\n`;
      } else {
          context += `INSTRUCTION: You are in LEARN MODE. Explain the concepts in [STUDY NOTES] patiently.\n\n`;
      }

      context += `[STUDY NOTES]\n${notes}\n\n`;
      
      if (questions && questions.length > 0) {
          context += `[QUESTION BANK] (Use these for quizzing):\n`;
          questions.forEach((q, i) => {
              context += `${i+1}. Q: ${q.question} | A: ${q.answer}\n`;
          });
      }

      return context;
  };

  // 1. Handle incoming navigation state (From Dashboard)
  useEffect(() => {
    if (location.state?.chapter && location.state?.subject) {
      const { subject, chapter } = location.state;
      const notes = chapter.rawContent || chapter.summary || 'No notes available.';
      
      const fullContext = buildContextString(subject, chapter.name, notes, chapter.questions || [], chapter.graph, mode);

      setExtractedContext(fullContext);
      setActiveSource({
        title: chapter.name,
        subtitle: subject,
        type: 'chapter',
        rawContent: chapter.rawContent || chapter.summary,
        questions: chapter.questions || [],
        graph: chapter.graph
      });
    } else {
       // Initialize General Context if no active source
       const generalContext = buildContextString("General Knowledge", "General Session", "General discussion.", [], undefined, mode);
       setExtractedContext(generalContext);
    }
  }, [location.state]);

  // 2. Wake Lock
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      if (isSessionActive && 'wakeLock' in navigator) {
        try {
          // @ts-ignore
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) { console.log('Wake Lock request failed:', err); }
      }
    };
    if (isSessionActive) requestWakeLock();
    return () => { if (wakeLock) wakeLock.release().catch(console.error); };
  }, [isSessionActive]);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcript, status, analyzingContent]);

  useEffect(() => () => { liveServiceRef.current?.disconnect(); }, []);

  // Feedback Handler
  const handleFeedback = (type: 'correct' | 'wrong') => {
      setFeedbackType(type);
      setTimeout(() => setFeedbackType(null), 2500); // Clear after 2.5s
  };

  // Mode Switching Logic
  const handleModeSwitch = async (newMode: 'learn' | 'quiz') => {
    if (newMode === mode) return;
    setMode(newMode);

    // Determine current content or default
    const currentSubject = activeSource?.subtitle || "General Knowledge";
    const currentChapter = activeSource?.title || "General Session";
    const currentNotes = activeSource?.rawContent || "No specific study notes provided.";
    const currentQuestions = activeSource?.questions || [];
    const currentGraph = activeSource?.graph;

    const newContext = buildContextString(currentSubject, currentChapter, currentNotes, currentQuestions, currentGraph, newMode);
    setExtractedContext(newContext);

    // If session is active, we must reconnect to apply the new System Instruction
    // CRITICAL: We avoid setTimeout here to try and preserve the user gesture (click),
    // although the async await on disconnect might still break it on strict browsers.
    // If it breaks, the user will just have to tap the mic button again, but we try to auto-reconnect.
    if (isSessionActive) {
        setTranscript(`Switching to ${newMode === 'quiz' ? 'Quiz' : 'Learn'} Mode...`);
        
        // 1. Disconnect current
        await liveServiceRef.current?.disconnect();
        
        // 2. Immediate Reconnect (Hope User Gesture is preserved or Permission persisted)
        const service = new GeminiLiveService(
            apiKey, 
            (s) => setStatus(s),
            () => {}, 
            (text) => setTranscript(text),
            handleVisualRequest,
            handleFeedback
        );
        liveServiceRef.current = service;
        try {
            await service.connect(newContext);
            setIsSessionActive(true);
        } catch (err) {
            console.error(err);
            setStatus('Connection Failed');
            setIsSessionActive(false); // Reset to allow manual tap
        }
    }
  };

  // --- Visual Generation ---
  const handleVisualRequest = async (prompt: string, concept: string) => {
    setGeneratingVisual(true);
    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        
        let base64 = '';
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) { base64 = part.inlineData.data; break; }
            }
        }

        if (base64) {
            const newImage: GeneratedImage = {
                id: crypto.randomUUID(),
                concept, base64, createdAt: new Date().toISOString(), sizeBytes: base64.length
            };
            saveStoredImage(newImage);
            setGeneratedVisual(newImage);
        }
    } catch (e) { console.error("Visual gen failed", e); } 
    finally { setGeneratingVisual(false); }
  };

  // Loading Messages for Engagement
  const LOADING_MESSAGES = [
    "Reading document...",
    "Analyzing content structure...",
    "Identifying key concepts...",
    "Separating study notes...",
    "Generating quiz questions...",
    "Building knowledge graph...",
    "Finalizing your lesson plan..."
  ];

  // Cycle through loading messages
  useEffect(() => {
    if (!analyzingContent) return;
    
    let msgIndex = 0;
    setTranscript(LOADING_MESSAGES[0]);
    
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      setTranscript(LOADING_MESSAGES[msgIndex]);
    }, 2500);

    return () => clearInterval(interval);
  }, [analyzingContent]);

  // --- Content Pipeline Handler ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActiveSource(null);
    setAnalyzingContent(true);
    // Transcript is now handled by the useEffect above
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const cleanBase64 = base64String.split(',')[1];
      
      try {
        const result = await generateKnowledgeGraph(apiKey, cleanBase64, file.type);
        
        if (result.subject && result.name) {
            saveUploadedChapter(
                result.subject, 
                result.name, 
                "Imported Content", 
                result.rawContent || "No text available", 
                "Medium",
                result.graph,
                result.questions
            );
            
            const fullContext = buildContextString(result.subject, result.name, result.rawContent || '', result.questions || [], result.graph, mode);
            setExtractedContext(fullContext);
            
            setActiveSource({
              title: result.name,
              subtitle: result.subject,
              type: 'upload',
              rawContent: result.rawContent,
              questions: result.questions,
              graph: result.graph
            });
            setTranscript(`Analysis Complete! Found ${result.questions?.length || 0} questions and notes. Tap mic to start.`);
        } else {
             setExtractedContext("Analysis unclear.");
             setActiveSource({ title: "General Discussion", subtitle: "General", type: 'upload' });
        }
      } catch (err) {
        console.error(err);
        setExtractedContext("Error processing file.");
      } finally {
        setAnalyzingContent(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleSession = async () => {
    if (isSessionActive) {
      await liveServiceRef.current?.disconnect();
      setIsSessionActive(false);
      setStatus('Idle');
    } else {
      if (!apiKey) return alert("API Key missing");
      setTranscript(''); 
      const service = new GeminiLiveService(
        apiKey, 
        (s) => setStatus(s),
        () => {}, 
        (text) => setTranscript(text),
        handleVisualRequest,
        handleFeedback
      );
      liveServiceRef.current = service;
      try {
        await service.connect(extractedContext);
        setIsSessionActive(true);
      } catch (err) {
        console.error(err);
        setStatus('Connection Failed');
      }
    }
  };

  return (
    <div className="min-h-full flex flex-col pt-4 pb-32 relative overflow-hidden">
      
      {/* 1. Active Context Header */}
      <div className="flex-1 flex flex-col items-center p-4 relative z-10">
        
        <div className={`w-full max-w-sm rounded-2xl p-4 mb-4 flex items-center gap-4 shadow-sm border transition-all duration-500 relative overflow-hidden ${isSessionActive ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isSessionActive ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-500'}`}>
               {analyzingContent ? <Loader2 className="w-6 h-6 animate-spin" /> : <BookOpen className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0 z-10">
               <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isSessionActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                   {analyzingContent ? "Building Graph..." : (activeSource?.subtitle || "No Content Selected")}
               </p>
               <h3 className="font-bold text-lg leading-tight truncate">
                   {activeSource?.title || "Ready to Learn"}
               </h3>
            </div>
            {activeSource && !analyzingContent && (
               <button onClick={() => setShowContentModal(true)} className={`p-2 rounded-full z-10 transition-colors ${isSessionActive ? 'text-indigo-200 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-100'}`}>
                   <Eye className="w-5 h-5" />
               </button>
            )}
        </div>

        {/* Mode Toggle Switch - ALWAYS VISIBLE unless analyzing */}
        {!analyzingContent && (
             <div className="flex bg-slate-200 p-1 rounded-xl mb-6 relative shadow-inner">
                 <button 
                    onClick={() => handleModeSwitch('learn')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all z-10 flex-1 justify-center ${mode === 'learn' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                    <Brain className="w-4 h-4" /> Learn
                 </button>
                 <button 
                    onClick={() => handleModeSwitch('quiz')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all z-10 flex-1 justify-center ${mode === 'quiz' ? 'bg-white text-orange-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                    <Trophy className="w-4 h-4" /> Quiz Mode
                 </button>
             </div>
        )}

        {/* Content Modal with Knowledge Graph & Questions */}
        {showContentModal && activeSource && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl w-full max-w-lg h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                    <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                        <div>
                            <h3 className="font-bold text-lg leading-tight text-slate-800">{activeSource.title}</h3>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mt-1">
                                <span className="uppercase tracking-wider">{activeSource.subtitle}</span>
                                {activeSource.graph && (
                                    <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Network className="w-3 h-3" /> {Object.keys(activeSource.graph.nodes).length} Concepts
                                    </span>
                                )}
                            </div>
                        </div>
                        <button onClick={() => setShowContentModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Questions Section */}
                        {activeSource.questions && activeSource.questions.length > 0 && (
                             <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <ListChecks className="w-4 h-4" /> Question Bank ({activeSource.questions.length})
                                </h4>
                                <div className="space-y-2">
                                    {activeSource.questions.map((q, idx) => (
                                        <div key={idx} className="bg-orange-50 rounded-xl p-3 border border-orange-100 text-sm">
                                            <p className="font-bold text-slate-800 mb-1">Q{idx+1}: {q.question}</p>
                                            <p className="text-slate-600 text-xs">{q.answer}</p>
                                        </div>
                                    ))}
                                </div>
                             </div>
                        )}

                        {/* Knowledge Graph Section */}
                        {activeSource.graph && Object.keys(activeSource.graph.nodes).length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Knowledge Graph</h4>
                                <div className="flex flex-wrap gap-2">
                                    {Object.values(activeSource.graph.nodes).map((node: any) => (
                                        <div key={node.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 max-w-[48%] flex-1">
                                            <p className="font-bold text-slate-700 text-sm mb-1">{node.name}</p>
                                            <p className="text-[10px] text-slate-500 leading-snug line-clamp-3">{node.description}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Extracted Text Section */}
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Study Notes</h4>
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <pre className="whitespace-pre-wrap text-sm text-slate-600 font-sans leading-relaxed">
                                    {activeSource.rawContent || "No text content available."}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="flex flex-col items-center justify-center py-4">
            <div className={`w-32 h-32 rounded-full bg-gradient-to-tr shadow-2xl flex items-center justify-center transition-all duration-500 ${mode === 'quiz' ? 'from-orange-500 to-red-500 shadow-orange-200' : 'from-indigo-500 to-purple-600 shadow-indigo-200'} ${isSessionActive ? 'scale-110 animate-pulse ring-4' : 'scale-100'} ${isSessionActive && mode === 'quiz' ? 'ring-orange-100' : 'ring-indigo-100'}`}>
                {analyzingContent ? <Loader2 className="w-12 h-12 text-white animate-spin" /> : (mode === 'quiz' ? <Trophy className="w-16 h-16 text-white" /> : <GraduationCap className="w-16 h-16 text-white" />)}
            </div>
            <div className="h-16 w-full max-w-[200px] mt-6 flex items-center justify-center">
                 <AudioVisualizer isActive={status === 'Active'} color={mode === 'quiz' ? '#f97316' : '#6366f1'} />
            </div>
        </div>

        <div ref={scrollRef} className={`mt-2 px-6 py-4 bg-white/60 backdrop-blur-sm rounded-2xl border max-w-sm w-full h-60 overflow-y-auto scroll-smooth text-center transition-all shadow-sm ${status.includes('Error') || status.includes('Denied') || status.includes('Required') ? 'border-red-300 bg-red-50' : 'border-white/50'}`}>
            <p className={`font-medium leading-relaxed text-sm whitespace-pre-wrap ${status.includes('Error') || status.includes('Denied') || status.includes('Required') ? 'text-red-600' : 'text-slate-600'}`}>
                {analyzingContent ? transcript : (transcript || (
                    status === 'Permission Denied' 
                    ? "Mic Access Denied. Please enable microphone permissions in your browser settings (near the URL bar) and reload." 
                    : (status === 'HTTPS Required' 
                        ? "Secure Connection Required. Please use localhost or HTTPS." 
                        : (isSessionActive ? (mode === 'quiz' ? "Starting Quiz..." : "Listening...") : "Tap the mic to start."))
                ))}
            </p>
        </div>
      </div>
      
      {/* Visual Aid Overlay */}
      {(generatedVisual || generatingVisual) && (
          <div className="absolute inset-x-4 top-24 z-30 bg-white p-2 rounded-2xl shadow-2xl border border-indigo-100 animate-in zoom-in duration-300">
             <div className="flex justify-between items-center mb-2 px-2">
                 <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500 fill-current" /><span className="text-xs font-bold text-indigo-600">AI Visual Aid</span></div>
                 <button onClick={() => setGeneratedVisual(null)} disabled={generatingVisual} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-4 h-4 text-slate-400" /></button>
             </div>
             <div className="aspect-square bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center">
                 {generatingVisual ? (
                     <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /><span className="text-xs font-bold text-slate-400">Drawing...</span></div>
                 ) : (
                     <img src={`data:image/png;base64,${generatedVisual?.base64}`} alt="Visual Aid" className="w-full h-full object-cover" />
                 )}
             </div>
             {generatedVisual && <p className="text-center text-xs font-bold text-slate-700 mt-2">{generatedVisual.concept}</p>}
          </div>
      )}

      {/* GRAFFITI FEEDBACK OVERLAY */}
      {feedbackType && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            {feedbackType === 'correct' ? (
                <div className="animate-[bounce_1s_infinite] flex flex-col items-center transform -rotate-12 scale-150">
                    <div className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-green-400 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] tracking-tighter" style={{ WebkitTextStroke: '2px white' }}>
                        AWESOME!
                    </div>
                    <div className="text-5xl animate-ping absolute opacity-30 text-green-300 font-black tracking-tighter">
                         AWESOME!
                    </div>
                    <div className="flex gap-4 mt-4">
                        <Star className="w-16 h-16 text-yellow-400 fill-yellow-400 animate-spin-slow drop-shadow-lg" />
                        <Star className="w-12 h-12 text-green-400 fill-green-400 animate-pulse drop-shadow-lg" />
                    </div>
                </div>
            ) : (
                <div className="animate-[pulse_0.5s_infinite] flex flex-col items-center transform rotate-6 scale-125">
                     <div className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-500 to-red-600 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] tracking-tighter" style={{ WebkitTextStroke: '2px white' }}>
                        OOPS!
                    </div>
                    <div className="text-2xl font-black text-white bg-red-500 px-4 py-1 rounded-full mt-2 rotate-3 shadow-xl border-4 border-white">
                        Try Again
                    </div>
                </div>
            )}
        </div>
      )}

      {/* Controls Area */}
      <div className="w-full bg-white rounded-t-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.05)] p-8 pb-10 z-20 mt-auto">
          <div className="flex justify-center gap-6 mb-8">
               <button disabled={!isSessionActive} className="flex flex-col items-center gap-2 text-slate-400 disabled:opacity-30 active:scale-95 transition-transform">
                   <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition-colors"><HelpCircle className="w-6 h-6" /></div>
                   <span className="text-[10px] font-bold">Hint</span>
               </button>
               <button disabled={!isSessionActive} className="flex flex-col items-center gap-2 text-slate-400 disabled:opacity-30 active:scale-95 transition-transform">
                   <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition-colors"><RefreshCcw className="w-6 h-6" /></div>
                   <span className="text-[10px] font-bold">Explain</span>
               </button>
               <label className="flex flex-col items-center gap-2 text-slate-400 cursor-pointer group active:scale-95 transition-transform">
                   <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-transparent group-hover:bg-indigo-50 group-hover:border-indigo-100 group-hover:text-indigo-600 transition-all">
                       <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" />
                       <Camera className="w-6 h-6" />
                   </div>
                   <span className="text-[10px] font-bold">New Scan</span>
               </label>
          </div>
          <div className="flex justify-center">
             <button onClick={toggleSession} disabled={analyzingContent} className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 bouncy-btn ${isSessionActive ? 'bg-red-500 text-white shadow-red-200 scale-100' : (mode === 'quiz' ? 'bg-orange-500 text-white shadow-orange-300 pulse-ring hover:scale-105' : 'bg-indigo-600 text-white shadow-indigo-300 pulse-ring hover:scale-105')} ${analyzingContent ? 'opacity-50 grayscale' : ''}`}>
                {status.includes('Required') || status.includes('Denied') ? <AlertTriangle className="w-8 h-8 text-white" /> : (isSessionActive ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />)}
             </button>
          </div>
          <p className="text-center mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{status.includes('Required') || status.includes('Denied') ? "Check Permissions" : (isSessionActive ? "Tap to Stop" : "Start Session")}</p>
      </div>
    </div>
  );
};

export default TutorSession;
