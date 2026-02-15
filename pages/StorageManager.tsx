
import React, { useEffect, useState } from 'react';
import { getStoredImages, getProfile, deleteChapter, clearStoredImages } from '../services/storageService';
import { GeneratedImage, StudentProfile, SubjectName, Chapter } from '../types';
import { Trash2, Image as ImageIcon, Download, Search, FileText, BookOpen, XCircle, Network, X, Eye, ListChecks } from 'lucide-react';

type Tab = 'materials' | 'gallery';

const StorageManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('materials');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  const loadData = () => {
    setImages(getStoredImages());
    setProfile(getProfile());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClearGallery = () => {
    if (confirm("Clear all generated visuals?")) {
      clearStoredImages();
      loadData();
    }
  };

  const handleDeleteChapter = (e: React.MouseEvent, chapterId: string, chapterName: string) => {
    e.stopPropagation(); // Prevents bubbling if inside a clickable container
    if (window.confirm(`Delete "${chapterName}"? You will need to re-upload it to study again.`)) {
        deleteChapter(chapterId);
        loadData();
        if (selectedChapter?.id === chapterId) setSelectedChapter(null);
    }
  };

  // Helper to flatten chapters for display
  const getAllChapters = () => {
      if (!profile) return [];
      const all: Array<{subject: SubjectName, data: Chapter}> = [];
      
      const chapters = Object.values(profile.chapters) as Chapter[];
      chapters.forEach((chap) => {
        all.push({ subject: chap.subject, data: chap });
      });

      return all.filter(c => c.data.name.toLowerCase().includes(searchTerm.toLowerCase()));
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Tabs */}
      <div className="flex p-1 bg-slate-200 rounded-xl">
          <button 
            onClick={() => setActiveTab('materials')} 
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'materials' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
          >
            Study Materials
          </button>
          <button 
            onClick={() => setActiveTab('gallery')} 
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'gallery' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
          >
            Visual Gallery
          </button>
      </div>

      {/* Search / Filter Bar */}
      <div className="flex gap-3">
         <div className="flex-1 bg-white h-12 rounded-xl flex items-center px-4 shadow-sm border border-slate-100">
             <Search className="w-5 h-5 text-slate-400 mr-2" />
             <input 
                type="text" 
                placeholder={activeTab === 'materials' ? "Search chapters..." : "Search visuals..."} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent w-full text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300" 
             />
         </div>
         {activeTab === 'gallery' && (
            <button onClick={handleClearGallery} className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-500">
                <Trash2 className="w-5 h-5" />
            </button>
         )}
      </div>

      {/* MATERIALS TAB */}
      {activeTab === 'materials' && (
        <div className="space-y-3">
            {getAllChapters().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-indigo-300" />
                    </div>
                    <h3 className="font-bold text-lg text-slate-800">No Materials Yet</h3>
                    <p className="text-sm">Upload PDFs in Tutor Mode to save them here.</p>
                </div>
            ) : (
                getAllChapters().map((item, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => setSelectedChapter(item.data)}
                        className="soft-card p-4 flex items-center gap-4 bg-white group cursor-pointer hover:shadow-lg transition-all active:scale-98"
                    >
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0 relative">
                            <BookOpen className="w-6 h-6" />
                            {item.data.questions && item.data.questions.length > 0 && (
                                <div className="absolute -top-1 -right-1 bg-orange-500 text-white rounded-full p-0.5 border-2 border-white">
                                    <ListChecks className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{item.subject}</span>
                                <span className="text-[10px] text-slate-400">{(item.data.rawContent?.length || 0) / 1000}kb stored</span>
                            </div>
                            <h4 className="font-bold text-slate-800 truncate">{item.data.name}</h4>
                            <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-1">
                                    <Eye className="w-3 h-3" /> View Details
                                </span>
                            </div>
                        </div>
                        <button 
                            onClick={(e) => handleDeleteChapter(e, item.data.id, item.data.name)}
                            className="p-2 text-slate-300 hover:text-red-500 transition-colors bg-slate-50 rounded-full hover:bg-red-50"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                ))
            )}
        </div>
      )}

      {/* GALLERY TAB */}
      {activeTab === 'gallery' && (
        <>
            {images.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                        <ImageIcon className="w-8 h-8 text-indigo-300" />
                    </div>
                    <h3 className="font-bold text-lg text-slate-800">Gallery Empty</h3>
                    <p className="text-sm">Visuals from tutor sessions appear here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    {images.filter(img => img.concept.toLowerCase().includes(searchTerm.toLowerCase())).map((img) => (
                        <div key={img.id} className="soft-card p-2 bg-white group">
                            <div className="aspect-square bg-slate-100 rounded-xl overflow-hidden mb-2 relative">
                                <img src={`data:image/png;base64,${img.base64}`} alt={img.concept} className="w-full h-full object-cover" />
                                <a href={`data:image/png;base64,${img.base64}`} download className="absolute bottom-2 right-2 p-2 bg-white/80 backdrop-blur rounded-full shadow-sm text-indigo-600">
                                    <Download className="w-4 h-4" />
                                </a>
                            </div>
                            <div className="px-1 mb-1">
                                <p className="font-bold text-slate-800 text-sm leading-tight truncate">{img.concept}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{new Date(img.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
      )}

      {/* CHAPTER DETAILS MODAL */}
      {selectedChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedChapter(null)}>
            <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* Modal Header */}
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-lg leading-tight text-slate-800 line-clamp-1">{selectedChapter.name}</h3>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mt-1">
                            <span className="uppercase tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">{selectedChapter.subject}</span>
                            <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" /> {(selectedChapter.rawContent?.length || 0) / 1000}kb
                            </span>
                        </div>
                    </div>
                    <button onClick={() => setSelectedChapter(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    
                    {/* Questions Section */}
                    {selectedChapter.questions && selectedChapter.questions.length > 0 && (
                         <div>
                             <div className="flex items-center gap-2 mb-3">
                                <ListChecks className="w-4 h-4 text-orange-500" />
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Question Bank ({selectedChapter.questions.length})</h4>
                            </div>
                            <div className="space-y-2">
                                {selectedChapter.questions.map((q, idx) => (
                                    <div key={idx} className="bg-orange-50 rounded-xl p-3 border border-orange-100 text-sm">
                                        <p className="font-bold text-slate-800 mb-1">Q: {q.question}</p>
                                        <p className="text-slate-600 text-xs italic">{q.answer || "Answer to be generated during session"}</p>
                                    </div>
                                ))}
                            </div>
                         </div>
                    )}

                    {/* Graph Visualization */}
                    {selectedChapter.graph && Object.keys(selectedChapter.graph.nodes || {}).length > 0 ? (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Network className="w-4 h-4 text-indigo-500" />
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Knowledge Graph</h4>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {Object.values(selectedChapter.graph.nodes).map((node: any) => (
                                    <div key={node.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 max-w-[48%] flex-1 hover:border-indigo-300 transition-colors shadow-sm">
                                        <p className="font-bold text-slate-700 text-sm mb-1">{node.name}</p>
                                        <p className="text-[10px] text-slate-500 leading-snug line-clamp-3">{node.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-center">
                            <Network className="w-8 h-8 text-slate-300 mb-2" />
                            <p className="text-sm text-slate-500 font-bold">No Concept Map</p>
                        </div>
                    )}

                    {/* Source Text */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Source Material</h4>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <pre className="whitespace-pre-wrap text-sm text-slate-600 font-sans leading-relaxed">
                                {selectedChapter.rawContent || "No text content available."}
                            </pre>
                        </div>
                    </div>

                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default StorageManager;
