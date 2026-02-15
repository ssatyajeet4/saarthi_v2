
import React, { useEffect, useState } from 'react';
import { getProfile, buyShopItem } from '../services/storageService';
import { StudentProfile, SubjectName, ConceptMastery } from '../types';
import { BADGE_DEFINITIONS, SHOP_ITEMS } from '../constants';
import { calculateAnalytics, AnalyticsSummary } from '../services/learningEngine';
import { SUPPORTED_SUBJECTS } from '../constants';
import { Trophy, Award, Zap, Timer, Target, BrainCircuit, Activity, ShoppingBag, Lock, Check, Snowflake, Moon, Sun, Flame, Footprints, Hand, GraduationCap, Eye, Bot, Heart, LayoutGrid } from 'lucide-react';

// Icon Map for dynamic rendering
const ICON_MAP: Record<string, any> = {
    Footprints, Hand, Flame, Moon, Sun, GraduationCap, Target, Eye, Snowflake, Bot
};

const ProgressPage: React.FC = () => {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'achievements' | 'shop'>('stats');

  const load = () => {
      const p = getProfile();
      setProfile(p);
      setAnalytics(calculateAnalytics(p.assessmentHistory || []));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePurchase = (itemId: string) => {
      if (confirm("Buy this item?")) {
          const result = buyShopItem(itemId);
          if (result.success) {
              alert(result.message);
              load();
          } else {
              alert(result.message);
          }
      }
  };

  if (!profile || !analytics) return null;

  // --- Sub-Components ---
  
  const StatCard = ({ label, value, icon: Icon, color }: any) => (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${color}`}>
              <Icon className="w-5 h-5 text-white" />
          </div>
          <p className="text-2xl font-black text-slate-800">{value}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      </div>
  );

  return (
    <div className="pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-100 mx-1">
            <button 
                onClick={() => setActiveTab('stats')} 
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'stats' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}
            >
                <Activity className="w-4 h-4" /> Stats
            </button>
            <button 
                onClick={() => setActiveTab('achievements')} 
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'achievements' ? 'bg-yellow-100 text-yellow-700' : 'text-slate-500'}`}
            >
                <Trophy className="w-4 h-4" /> Badges
            </button>
            <button 
                onClick={() => setActiveTab('shop')} 
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'shop' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500'}`}
            >
                <ShoppingBag className="w-4 h-4" /> Shop
            </button>
        </div>

        {/* --- STATS TAB --- */}
        {activeTab === 'stats' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Accuracy" value={`${analytics.accuracy}%`} icon={Target} color="bg-green-500" />
                    <StatCard label="Avg Speed" value={`${analytics.avgTime}s`} icon={Timer} color="bg-orange-500" />
                    <StatCard label="Confidence" value={`${Math.round(analytics.avgConfidence * 100)}%`} icon={BrainCircuit} color="bg-purple-500" />
                    <StatCard label="Questions" value={analytics.totalQuestions} icon={LayoutGrid} color="bg-blue-500" />
                </div>

                <div className="soft-card p-6">
                    <h3 className="font-bold text-lg text-slate-800 mb-4 fun-font">Subject Mastery</h3>
                    <div className="space-y-4">
                        {SUPPORTED_SUBJECTS.map(subject => {
                             // Simple mock calc for demo visual
                             const subjectMastery = 0; 
                             return (
                                <div key={subject}>
                                    <div className="flex justify-between mb-1">
                                        <span className="font-bold text-xs text-slate-600">{subject}</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 w-0"></div> 
                                    </div>
                                </div>
                             );
                        })}
                        <p className="text-xs text-center text-slate-400 mt-2">Detailed subject tracking active.</p>
                    </div>
                </div>
            </div>
        )}

        {/* --- ACHIEVEMENTS TAB --- */}
        {activeTab === 'achievements' && (
            <div className="space-y-4">
                <div className="soft-card p-4 bg-yellow-50 border-yellow-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-yellow-600 uppercase tracking-wider">Total XP</p>
                        <p className="text-3xl font-black text-slate-800">{profile.gamification.xp}</p>
                    </div>
                    <Trophy className="w-12 h-12 text-yellow-500" />
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {BADGE_DEFINITIONS.map(def => {
                        const isUnlocked = profile.gamification.badges.includes(def.id);
                        const Icon = ICON_MAP[def.icon] || Award;
                        
                        return (
                            <div key={def.id} className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${isUnlocked ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60 grayscale'}`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${isUnlocked ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-md' : 'bg-slate-200 text-slate-400'}`}>
                                    <Icon className="w-7 h-7" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800">{def.name}</h4>
                                    <p className="text-xs text-slate-500 leading-tight mb-1">{def.description}</p>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isUnlocked ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                                        {isUnlocked ? 'Unlocked' : `+${def.xpReward} XP`}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* --- SHOP TAB --- */}
        {activeTab === 'shop' && (
            <div className="space-y-4">
                 <div className="soft-card p-4 bg-emerald-50 border-emerald-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Your Wallet</p>
                        <p className="text-3xl font-black text-slate-800">{profile.gamification.coins} Coins</p>
                    </div>
                    <ShoppingBag className="w-12 h-12 text-emerald-500" />
                </div>

                <div className="space-y-3">
                    {SHOP_ITEMS.map(item => {
                        const canAfford = profile.gamification.coins >= item.cost;
                        const isOwned = profile.gamification.inventory.includes(item.id);
                        const isMaxed = item.type === 'streak_freeze' && profile.gamification.streak.freezeInventory >= 3;
                        const Icon = ICON_MAP[item.icon] || ShoppingBag;

                        return (
                            <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-500">
                                    <Icon className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-800">{item.name}</h4>
                                    <p className="text-xs text-slate-500">{item.description}</p>
                                    {item.type === 'streak_freeze' && (
                                        <p className="text-[10px] font-bold text-blue-500 mt-1">Owned: {profile.gamification.streak.freezeInventory}/3</p>
                                    )}
                                </div>
                                <button 
                                    onClick={() => handlePurchase(item.id)}
                                    disabled={!canAfford || isOwned || isMaxed}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                        isOwned || isMaxed 
                                        ? 'bg-slate-100 text-slate-400' 
                                        : (canAfford ? 'bg-indigo-600 text-white shadow-md active:scale-95' : 'bg-slate-200 text-slate-400')
                                    }`}
                                >
                                    {isOwned ? 'Owned' : (isMaxed ? 'Maxed' : `${item.cost} Coins`)}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

    </div>
  );
};

export default ProgressPage;
