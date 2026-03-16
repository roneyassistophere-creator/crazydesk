'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { 
  Globe, User, Smartphone, Bot, CheckCircle2, 
  Plus, X, ChevronRight, ChevronLeft, Trash2,
  Layout, Target, Flag, Settings2, Check, Search, 
  Archive, RotateCcw, BookOpen, Sparkles, Map
} from 'lucide-react';
import ConfirmationModal from '@/components/common/ConfirmationModal';

interface SubTask {
  id: string | number;
  text: string;
  completed: boolean;
}

interface Milestone {
  id: string;
  label: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: string;
  dueDate: string;
  desc: string;
  checklist: SubTask[];
  roadmapId?: string;
}

interface Roadmap {
  id: string;
  title: string;
  agenda: string;
  icon: string;
  theme: string;
  milestones: Milestone[];
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = { Globe, User, Smartphone, Bot, Layout, Settings2, Target, Sparkles, BookOpen, Map };

const getIcon = (name: string) => {
  const IconComponent = iconMap[name] || Layout;
  return <IconComponent className="w-3.5 h-3.5" />;
};

export default function RoadmapPage() {
  const { profile } = useAuth();
  const router = useRouter();

  // Role gate: redirect non-admin/manager
  useEffect(() => {
    if (profile && profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
      router.push('/dashboard');
    }
  }, [profile, router]);

  const [roadmaps, setRoadmaps] = useState<Roadmap[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('crazydesk_roadmaps');
    return saved ? JSON.parse(saved) : [
      {
        id: 'road-1',
        title: 'Website Success Path',
        agenda: 'To build a high-converting, SEO-optimized platform.',
        icon: 'Globe',
        theme: 'primary',
        milestones: [
          { 
            id: 'm1', 
            label: 'Foundation', 
            status: 'completed' as const, 
            priority: 'High',
            dueDate: '2024-12-01',
            desc: 'Primary site architecture and Next.js setup.',
            checklist: [
              { id: 's1', text: 'Initialize Repo', completed: true },
              { id: 's2', text: 'Setup Tailwind', completed: true },
              { id: 's3', text: 'Deployment Pipeline', completed: true }
            ]
          }
        ]
      }
    ];
  });

  const [archivedRoadmaps, setArchivedRoadmaps] = useState<Roadmap[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('crazydesk_archived_roadmaps');
    return saved ? JSON.parse(saved) : [];
  });

  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState<(Milestone & { roadmapId: string }) | null>(null);
  const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string; type: 'roadmap' | 'milestone'; roadmapId?: string } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('crazydesk_roadmaps', JSON.stringify(roadmaps));
    localStorage.setItem('crazydesk_archived_roadmaps', JSON.stringify(archivedRoadmaps));
  }, [roadmaps, archivedRoadmaps]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const addRoadmap = () => {
    const themes = ['primary', 'secondary', 'accent', 'info'];
    const newRoadmap: Roadmap = {
      id: `road-${Date.now()}`,
      title: 'New Path',
      agenda: '',
      icon: 'Target',
      theme: themes[Math.floor(Math.random() * themes.length)],
      milestones: []
    };
    setRoadmaps([...roadmaps, newRoadmap]);
    setSelectedRoadmap(newRoadmap);
    setSelectedMilestone(null);
    setIsSidebarOpen(true);
    setViewMode('active');
  };

  const deleteRoadmap = (id: string) => {
    if (viewMode === 'active') {
      setRoadmaps(roadmaps.filter(r => r.id !== id));
    } else {
      setArchivedRoadmaps(archivedRoadmaps.filter(r => r.id !== id));
    }
    if (selectedRoadmap?.id === id) setIsSidebarOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'roadmap') {
      deleteRoadmap(deleteConfirm.id);
    } else {
      const deleteFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;
      const currentList = viewMode === 'active' ? roadmaps : archivedRoadmaps;
      deleteFunc(currentList.map(road => road.id === deleteConfirm.roadmapId ? { ...road, milestones: road.milestones.filter(m => m.id !== deleteConfirm.id) } : road));
      setIsSidebarOpen(false);
    }
    setDeleteConfirm(null);
  };

  const archiveRoadmap = (id: string) => {
    const roadmapToArchive = roadmaps.find(r => r.id === id);
    if (roadmapToArchive) {
      setArchivedRoadmaps([roadmapToArchive, ...archivedRoadmaps]);
      setRoadmaps(roadmaps.filter(r => r.id !== id));
      if (selectedRoadmap?.id === id) setIsSidebarOpen(false);
    }
  };

  const restoreRoadmap = (id: string) => {
    const roadmapToRestore = archivedRoadmaps.find(r => r.id === id);
    if (roadmapToRestore) {
      setRoadmaps([roadmapToRestore, ...roadmaps]);
      setArchivedRoadmaps(archivedRoadmaps.filter(r => r.id !== id));
    }
  };

  const addMilestone = (roadmapId: string) => {
    const newId = `m-${Math.random().toString(36).substr(2, 9)}`;
    const newMilestone: Milestone = {
      id: newId,
      label: 'New Point',
      status: 'todo',
      priority: 'Medium',
      dueDate: '',
      desc: '',
      checklist: []
    };
    
    const updateFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;
    const currentList = viewMode === 'active' ? roadmaps : archivedRoadmaps;

    updateFunc(currentList.map(road => 
      road.id === roadmapId ? { ...road, milestones: [...road.milestones, newMilestone] } : road
    ));
    setSelectedMilestone({ ...newMilestone, roadmapId });
    setSelectedRoadmap(null);
    setIsSidebarOpen(true);
  };

  const updateMilestone = (updated: Milestone & { roadmapId: string }) => {
    const updateFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;
    const currentList = viewMode === 'active' ? roadmaps : archivedRoadmaps;

    updateFunc(currentList.map(road => ({
      ...road,
      milestones: road.milestones.map(m => m.id === updated.id ? { ...updated, roadmapId: undefined } as Milestone : m)
    })));
  };

  const toggleSubtask = (roadmapId: string, milestoneId: string, subtaskId: string | number) => {
    const updateFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;

    updateFunc(prevList => prevList.map(road => {
      if (road.id !== roadmapId) return road;
      return {
        ...road,
        milestones: road.milestones.map(m => {
          if (m.id !== milestoneId) return m;
          const updatedChecklist = m.checklist.map(t => 
            t.id === subtaskId ? { ...t, completed: !t.completed } : t
          );
          
          const completedCount = updatedChecklist.filter(t => t.completed).length;
          const totalCount = updatedChecklist.length;
          let newStatus: Milestone['status'] = m.status;
          
          if (totalCount > 0) {
            if (completedCount === totalCount) newStatus = 'completed';
            else if (completedCount > 0) newStatus = 'in-progress';
            else newStatus = 'todo';
          }

          const updatedMilestone = { ...m, checklist: updatedChecklist, status: newStatus };
          if (selectedMilestone?.id === milestoneId) {
            setSelectedMilestone({ ...selectedMilestone, ...updatedMilestone });
          }
          return updatedMilestone;
        })
      };
    }));
  };

  const getSortedMilestones = (milestones: Milestone[]) => {
    return [...milestones].sort((a, b) => {
      const order: Record<string, number> = { 'completed': 0, 'in-progress': 1, 'todo': 2 };
      return order[a.status] - order[b.status];
    });
  };

  // Auto-scroll refs per roadmap
  const timelineRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentMilestoneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-scroll to current milestone on mount / data change
  useEffect(() => {
    Object.keys(currentMilestoneRefs.current).forEach(roadId => {
      const el = currentMilestoneRefs.current[roadId];
      const container = timelineRefs.current[roadId];
      if (el && container) {
        // Scroll so the current milestone is near the top of the timeline
        const offset = el.offsetTop - container.offsetTop - 8;
        container.scrollTo({ top: offset, behavior: 'smooth' });
      }
    });
  }, [roadmaps, archivedRoadmaps]);

  const currentDisplayList = useMemo(() => {
    const baseList = viewMode === 'active' ? roadmaps : archivedRoadmaps;
    return baseList.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [roadmaps, archivedRoadmaps, viewMode, searchQuery]);

  const calculateRoadmapProgress = (milestones: Milestone[]) => {
    if (milestones.length === 0) return 0;
    const scoreMap: Record<string, number> = { 'completed': 100, 'in-progress': 50, 'todo': 0 };
    const totalScore = milestones.reduce((acc, m) => acc + scoreMap[m.status], 0);
    return Math.round(totalScore / milestones.length);
  };

  if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'MANAGER')) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden relative -m-8">
      {/* Main Content Area */}
      <div className={`flex flex-col flex-1 h-full min-w-0 transition-all duration-300 ${isSidebarOpen ? 'mr-[400px]' : ''}`}>
        
        {/* Header */}
        <header className="w-full px-6 py-4 flex items-center justify-between bg-base-100 border-b border-base-300 z-30 shrink-0 rounded-t-xl">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {viewMode === 'active' ? 'Strategy Dashboard' : 'Completed Paths'}
              </h1>
              <p className="text-[10px] text-base-content/40 font-medium uppercase tracking-widest leading-none mt-1">Focus Timeline</p>
            </div>
            
            <div className="flex gap-1 bg-base-200 p-0.5 rounded-lg border border-base-300">
              <button onClick={() => scroll('left')} className="p-1.5 hover:bg-base-100 rounded-md text-base-content/50 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => scroll('right')} className="p-1.5 hover:bg-base-100 rounded-md text-base-content/50 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-base-200 p-1 rounded-lg border border-base-300 mr-2">
              <button 
                onClick={() => setViewMode('active')}
                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${viewMode === 'active' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/40 hover:text-base-content/60'}`}
              >
                Active
              </button>
              <button 
                onClick={() => setViewMode('completed')}
                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${viewMode === 'completed' ? 'bg-base-100 text-success shadow-sm' : 'text-base-content/40 hover:text-base-content/60'}`}
              >
                Completed {archivedRoadmaps.length > 0 && `(${archivedRoadmaps.length})`}
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/40" />
              <input 
                type="text" 
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input input-sm input-bordered pl-8 pr-3 w-36 text-xs"
              />
            </div>
            {viewMode === 'active' && (
              <button 
                onClick={addRoadmap}
                className="btn btn-primary btn-sm gap-1.5 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> New Path
              </button>
            )}
          </div>
        </header>

        {/* Grid Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-6 min-w-0" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex gap-8 items-start h-full min-w-max">
            {currentDisplayList.length === 0 ? (
              <div className="w-[80vw] flex flex-col items-center justify-center py-20 bg-base-100/50 rounded-3xl border-2 border-dashed border-base-300">
                <Archive className="w-12 h-12 text-base-content/20 mb-4" />
                <p className="text-base-content/40 font-medium uppercase text-[10px] tracking-widest">
                  {viewMode === 'active' ? 'No Active Paths' : 'No Completed Paths Found'}
                </p>
              </div>
            ) : (
              currentDisplayList.map((road) => {
                const sortedMilestones = getSortedMilestones(road.milestones);
                const progress = calculateRoadmapProgress(road.milestones);
                const isComplete = progress === 100;

                return (
                  <div key={road.id} className="w-[260px] shrink-0 flex flex-col h-full max-h-[calc(100vh-200px)]">
                    {/* Roadmap Header Card */}
                    <div 
                      onClick={() => { setSelectedRoadmap(road); setSelectedMilestone(null); setIsSidebarOpen(true); }}
                      className={`
                        bg-base-100 rounded-xl p-4 border transition-all cursor-pointer relative shrink-0 z-20 group
                        ${selectedRoadmap?.id === road.id ? 'border-primary shadow-md' : 'border-base-300 shadow-sm'}
                      `}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg bg-${road.theme} text-${road.theme}-content shadow-sm`}>
                          {getIcon(road.icon)}
                        </div>
                        <h3 className="font-bold text-sm truncate uppercase tracking-tight flex-1">
                          {road.title}
                        </h3>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {viewMode === 'active' && isComplete && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); archiveRoadmap(road.id); }}
                              className="p-1 text-success hover:bg-success/10 rounded-md transition-all"
                              title="Archive"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {viewMode === 'completed' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); restoreRoadmap(road.id); }}
                              className="p-1 text-primary hover:bg-primary/10 rounded-md transition-all"
                              title="Restore to Active"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: road.id, title: road.title, type: 'roadmap' }); }}
                            className="p-1 text-base-content/30 hover:text-error transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-bold text-base-content/40 uppercase tracking-tighter">
                          <span>{viewMode === 'completed' ? 'Status: Completed' : 'Progress'}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1 w-full bg-base-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-700 ${isComplete ? 'bg-success' : 'bg-primary'}`} 
                            style={{ width: `${progress}%` }} 
                          />
                        </div>
                      </div>
                      
                      {viewMode === 'active' && isComplete && (
                        <div className="mt-3">
                          <button 
                            onClick={(e) => { e.stopPropagation(); archiveRoadmap(road.id); }}
                            className="btn btn-success btn-xs w-full gap-1.5 uppercase tracking-widest text-[9px] font-black"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Save Aside
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Vertical Timeline */}
                    <div 
                      ref={(el) => { timelineRefs.current[road.id] = el; }}
                      className="flex-1 overflow-y-auto pt-6 pb-12 relative" 
                      style={{ scrollbarWidth: 'none' }}
                    >
                      <div className="relative pl-5">
                        <div className="absolute left-[24px] top-0 bottom-10 w-0.5 bg-base-300 rounded-full opacity-60" />
                        
                        <div className="space-y-5">
                          {(() => {
                            // Find the first non-completed milestone (current active)
                            const currentIdx = sortedMilestones.findIndex(m => m.status !== 'completed');
                            const completedCount = currentIdx === -1 ? sortedMilestones.length : currentIdx;

                            return sortedMilestones.map((milestone, idx) => {
                              // Graduated opacity: completed items fade based on distance from current
                              let opacityClass = 'opacity-100';
                              if (milestone.status === 'completed') {
                                const distFromCurrent = completedCount - idx - 1;
                                if (distFromCurrent >= 3) opacityClass = 'opacity-15';
                                else if (distFromCurrent === 2) opacityClass = 'opacity-20';
                                else if (distFromCurrent === 1) opacityClass = 'opacity-30';
                                else opacityClass = 'opacity-40';
                              }
                              const isCurrent = idx === currentIdx;

                              return (
                            <div 
                              key={milestone.id}
                              ref={isCurrent ? (el) => { currentMilestoneRefs.current[road.id] = el; } : undefined}
                              className={`flex flex-col transition-all duration-300 ${opacityClass}`}
                            >
                              <div 
                                onClick={() => { setSelectedMilestone({...milestone, roadmapId: road.id}); setSelectedRoadmap(null); setIsSidebarOpen(true); }}
                                className="relative flex items-start group cursor-pointer"
                              >
                                <div className={`
                                  absolute left-[-2px] top-[6px] w-4 h-4 rounded-full border-2 z-20 transition-all flex items-center justify-center
                                  ${milestone.status === 'completed' ? 'bg-success border-success/30' : 'bg-base-100 border-base-300'}
                                  ${milestone.status === 'in-progress' ? 'border-primary ring-4 ring-primary/10' : ''}
                                `}>
                                  {milestone.status === 'completed' && <Check className="w-2.5 h-2.5 text-success-content" />}
                                  {milestone.status === 'in-progress' && <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
                                </div>

                                <div className={`
                                  ml-8 p-2 rounded-lg border bg-base-100 w-full transition-all text-left
                                  ${selectedMilestone?.id === milestone.id ? 'border-primary shadow-sm' : 'border-transparent group-hover:border-base-300'}
                                `}>
                                  <h4 className={`text-[11px] font-bold leading-[1.2] tracking-tight uppercase ${milestone.status === 'completed' ? 'text-base-content/40' : 'text-base-content'}`}>
                                    {milestone.label}
                                  </h4>
                                </div>
                              </div>

                              {milestone.status !== 'completed' && milestone.checklist.length > 0 && (
                                <div className="ml-[22px] flex flex-col gap-2 py-2">
                                  {milestone.checklist.map((task) => (
                                    <div key={task.id} className="flex items-start gap-3 group">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleSubtask(road.id, milestone.id, task.id); }}
                                        className={`
                                          shrink-0 w-3 h-3 rounded border flex items-center justify-center transition-all mt-[0.5px]
                                          ${task.completed ? 'bg-success border-success' : 'bg-base-100 border-base-300'}
                                        `}
                                      >
                                        {task.completed && <Check className="w-2 h-2 text-success-content" />}
                                      </button>
                                      <div className="flex-1 text-left">
                                        <span className={`block text-[10px] font-medium leading-[13px] transition-colors ${task.completed ? 'text-base-content/30 line-through' : 'text-base-content/50'}`}>
                                          {task.text || 'Step...'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                          );
                            });
                          })()}

                          {viewMode === 'active' && (
                            <button 
                              onClick={() => addMilestone(road.id)}
                              className="ml-6 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-base-300 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all w-[calc(100%-24px)] text-[9px] font-bold uppercase tracking-widest"
                            >
                              <Plus className="w-3 h-3" /> New Point
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* --- DETAIL SIDEBAR --- */}
      <div className={`
        fixed top-0 right-0 bottom-0 w-[400px] bg-base-100 shadow-2xl border-l border-base-300 
        transform transition-transform duration-300 ease-in-out z-[60] overflow-y-auto flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {selectedRoadmap && (
          <div className="p-6 flex flex-col h-full">
            <header className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-base-200 rounded-lg"><Settings2 className="w-4 h-4" /></div>
                <h2 className="font-bold text-sm uppercase tracking-widest">Roadmap Settings</h2>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="btn btn-ghost btn-sm btn-square">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="space-y-6 flex-1">
              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-2">Title</label>
                <input 
                  type="text" 
                  value={selectedRoadmap.title}
                  onChange={(e) => { 
                    const u = { ...selectedRoadmap, title: e.target.value }; 
                    setSelectedRoadmap(u); 
                    if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                    else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                  }}
                  className="input input-ghost w-full text-lg font-black p-0 uppercase tracking-tighter"
                />
              </section>

              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-2">Agenda</label>
                <textarea 
                  value={selectedRoadmap.agenda}
                  onChange={(e) => { 
                    const u = { ...selectedRoadmap, agenda: e.target.value }; 
                    setSelectedRoadmap(u); 
                    if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                    else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                  }}
                  rows={4}
                  className="textarea textarea-bordered w-full text-xs"
                  placeholder="Define the strategic mission..."
                />
              </section>

              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-3">Theme & Icon</label>
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {['primary', 'secondary', 'accent', 'info', 'neutral'].map(t => (
                    <button 
                      key={t}
                      onClick={() => { 
                        const u = { ...selectedRoadmap, theme: t }; 
                        setSelectedRoadmap(u); 
                        if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                        else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                      }}
                      className={`h-6 rounded-md border-2 transition-all bg-${t} ${selectedRoadmap.theme === t ? 'border-base-content shadow-md scale-105' : 'border-transparent'}`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {Object.keys(iconMap).map(iconName => (
                    <button 
                      key={iconName}
                      onClick={() => { 
                        const u = { ...selectedRoadmap, icon: iconName }; 
                        setSelectedRoadmap(u); 
                        if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                        else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                      }}
                      className={`p-2.5 rounded-lg border flex items-center justify-center transition-all ${selectedRoadmap.icon === iconName ? 'bg-primary text-primary-content border-primary' : 'bg-base-200 text-base-content/40 border-base-300'}`}
                    >
                      {getIcon(iconName)}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {selectedMilestone && (
          <div className="p-6 flex flex-col h-full">
            <header className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-base-200 rounded-lg"><Flag className="w-4 h-4" /></div>
                <h2 className="font-bold text-sm uppercase tracking-widest">Point Config</h2>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="btn btn-ghost btn-sm btn-square">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="space-y-8 flex-1">
              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-2">Label</label>
                <input 
                  type="text" 
                  value={selectedMilestone.label}
                  onChange={(e) => { const u = { ...selectedMilestone, label: e.target.value }; setSelectedMilestone(u); updateMilestone(u); }}
                  className="input input-ghost w-full text-xl font-black p-0 uppercase tracking-tight mb-6"
                />
                <div className="grid grid-cols-3 gap-2">
                  {(['todo', 'in-progress', 'completed'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => { const u = { ...selectedMilestone, status }; setSelectedMilestone(u); updateMilestone(u); }}
                      className={`
                        py-2 text-[9px] font-bold uppercase rounded-lg border transition-all
                        ${selectedMilestone.status === status ? 'bg-primary text-primary-content border-primary shadow-md' : 'bg-base-200 text-base-content/40 border-base-300'}
                      `}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-3">Checklist</label>
                <div className="space-y-2">
                  {selectedMilestone.checklist.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 p-2 bg-base-200/50 rounded-lg group">
                      <button 
                        onClick={() => toggleSubtask(selectedMilestone.roadmapId, selectedMilestone.id, task.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${task.completed ? 'bg-success border-success' : 'bg-base-100 border-base-300'}`}
                      >
                        {task.completed && <Check className="w-2.5 h-2.5 text-success-content" />}
                      </button>
                      <input 
                        type="text"
                        value={task.text}
                        onChange={(e) => {
                          const updated = {
                            ...selectedMilestone,
                            checklist: selectedMilestone.checklist.map(t => t.id === task.id ? { ...t, text: e.target.value } : t)
                          };
                          setSelectedMilestone(updated);
                          updateMilestone(updated);
                        }}
                        className={`flex-1 bg-transparent border-none p-0 text-xs focus:outline-none ${task.completed ? 'text-base-content/40 line-through' : 'font-medium'}`}
                        placeholder="New step..."
                      />
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      const updated = {
                        ...selectedMilestone,
                        checklist: [...selectedMilestone.checklist, { id: `st-${Date.now()}`, text: '', completed: false }]
                      };
                      setSelectedMilestone(updated);
                      updateMilestone(updated);
                    }}
                    className="w-full py-2 border border-dashed border-base-300 rounded-lg text-[9px] font-bold text-base-content/40 uppercase tracking-widest hover:border-primary hover:text-primary transition-all"
                  >
                    + Add Step
                  </button>
                </div>
              </section>
            </div>

            <footer className="pt-6 border-t border-base-300 flex justify-between">
              <button 
                onClick={() => setDeleteConfirm({ id: selectedMilestone.id, title: selectedMilestone.label, type: 'milestone', roadmapId: selectedMilestone.roadmapId })}
                className="btn btn-ghost btn-sm text-error"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setIsSidebarOpen(false)} className="btn btn-primary btn-sm uppercase tracking-widest text-[10px] font-bold px-6">
                Confirm
              </button>
            </footer>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-base-content/20 backdrop-blur-[1px] z-[55] transition-opacity" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title={deleteConfirm?.type === 'roadmap' ? 'Delete Roadmap' : 'Delete Milestone'}
        message={`"${deleteConfirm?.title || ''}" and all its ${deleteConfirm?.type === 'roadmap' ? 'milestones' : 'checklist items'} will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
