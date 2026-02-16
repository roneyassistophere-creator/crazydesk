import { useState, useEffect } from 'react';
import { MemberProfile, TimeSlot, DAYS_OF_WEEK } from '@/types/team';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Plus, Trash2, X, Clock, Briefcase, Calendar } from 'lucide-react';

interface EditMemberModalProps {
  member: MemberProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditMemberModal({ member, isOpen, onClose }: EditMemberModalProps) {
  const [jobTitle, setJobTitle] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (member) {
      setJobTitle(member.jobTitle || '');
      setScopeOfWork(member.scopeOfWork || '');
      setSlots(member.availableSlots || []);
    }
  }, [member]);

  const handleSave = async () => {
    if (!member) return;
    setLoading(true);
    setError('');

    try {
      await setDoc(doc(db, 'member_profiles', member.uid), {
        uid: member.uid,
        displayName: member.displayName,
        email: member.email,
        jobTitle,
        scopeOfWork,
        availableSlots: slots,
        updatedAt: serverTimestamp()
      }, { merge: true });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const addSlot = () => {
    setSlots([...slots, { day: 'Monday', startTime: '09:00', endTime: '17:00', timezone: 'UTC' }]);
  };

  const removeSlot = (index: number) => {
    const newSlots = slots.filter((_, i) => i !== index);
    setSlots(newSlots);
  };

  const updateSlot = (index: number, field: keyof TimeSlot, value: string) => {
    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSlots(newSlots);
  };

  if (!isOpen || !member) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
          
        {/* Header / Cover */}
        <div className="h-32 bg-base-200/50 w-full relative border-b border-base-200 shrink-0">
             <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-secondary/5"></div>
             <button 
                onClick={onClose} 
                className="absolute top-3 right-3 btn btn-circle btn-sm btn-ghost bg-base-100/50 hover:bg-base-100 border border-base-content/5 z-20 shadow-sm"
             >
                <X size={18} />
             </button>
             <div className="absolute bottom-4 left-6 mix-blend-hard-light backdrop-blur-sm bg-base-100/30 px-3 py-1 rounded-lg border border-white/20">
                <h2 className="text-xl font-bold tracking-tight text-base-content">Edit Profile</h2>
             </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-none">
                {error && <div className="alert alert-error text-sm shadow-sm rounded-xl mb-4 py-2">{error}</div>}
                
                {/* Role Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 font-bold uppercase text-xs tracking-widest opacity-40 mb-2">
                        <Briefcase size={14} /> Role Information
                    </div>
                    
                    <div className="grid gap-4 bg-base-200/50 p-4 rounded-xl border border-base-200">
                        <div className="form-control w-full">
                            <label className="label pt-0 pb-1.5"><span className="label-text font-bold text-xs uppercase opacity-70">Job Title</span></label>
                            <input 
                                type="text" 
                                className="input input-sm input-bordered w-full bg-base-100 focus:bg-base-100 transition-colors rounded-lg border-base-300 focus:border-primary" 
                                placeholder="e.g. Senior Product Designer"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                            />
                        </div>

                        <div className="form-control w-full">
                            <label className="label pt-0 pb-1.5"><span className="label-text font-bold text-xs uppercase opacity-70">Scope of Work</span></label>
                            <textarea 
                                className="textarea textarea-bordered h-24 text-sm leading-relaxed bg-base-100 focus:bg-base-100 transition-colors rounded-lg border-base-300 focus:border-primary" 
                                placeholder="- Leading design system updates..."
                                value={scopeOfWork}
                                onChange={(e) => setScopeOfWork(e.target.value)}
                            ></textarea>
                            <label className="label pb-0"><span className="label-text-alt opacity-40 text-xs">Supports Markdown formatting</span></label>
                        </div>
                    </div>
                </section>

                {/* Availability Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 font-bold uppercase text-xs tracking-widest opacity-40">
                            <Calendar size={14} /> Schedule
                        </div>
                        <button 
                            onClick={addSlot} 
                            className="btn btn-xs btn-ghost gap-1 opacity-60 hover:opacity-100"
                        >
                            <Plus size={12} /> Add Slot
                        </button>
                    </div>
                    
                    {slots.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 border border-dashed border-base-300 rounded-xl bg-base-200/30 text-base-content/50 gap-2 cursor-pointer hover:bg-base-200/50 transition-colors" onClick={addSlot}>
                            <Clock size={16} className="opacity-50" />
                            <span className="text-xs font-medium">No availability slots added yet.</span>
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            {slots.map((slot, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row items-center gap-2 bg-base-100 p-2 rounded-lg border border-base-200 group">
                                    
                                    {/* Day Selector */}
                                    <div className="w-full sm:w-32 shrink-0">
                                        <select 
                                            className="select select-bordered select-xs w-full font-medium bg-base-200/50 focus:bg-base-100 border-transparent focus:border-base-300 rounded"
                                            value={slot.day}
                                            onChange={(e) => updateSlot(idx, 'day', e.target.value as any)}
                                        >
                                            {DAYS_OF_WEEK.map(day => (
                                                <option key={day} value={day}>{day}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {/* Time Inputs */}
                                    <div className="flex items-center gap-1.5 flex-1 w-full sm:w-auto">
                                        <div className="flex-1">
                                            <input 
                                                type="time" 
                                                className="input input-bordered input-xs w-full font-mono bg-base-200/50 focus:bg-base-100 border-transparent focus:border-base-300 rounded text-center" 
                                                value={slot.startTime}
                                                onChange={(e) => updateSlot(idx, 'startTime', e.target.value)}
                                            />
                                        </div>
                                        <span className="text-base-content/30 text-xs">-</span>
                                        <div className="flex-1">
                                            <input 
                                                type="time" 
                                                className="input input-bordered input-xs w-full font-mono bg-base-200/50 focus:bg-base-100 border-transparent focus:border-base-300 rounded text-center" 
                                                value={slot.endTime}
                                                onChange={(e) => updateSlot(idx, 'endTime', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Delete Button */}
                                    <button 
                                        onClick={() => removeSlot(idx)} 
                                        className="btn btn-ghost btn-xs text-error btn-square hover:bg-error/10"
                                        title="Remove slot"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-base-200 flex justify-end gap-2 shrink-0 bg-base-50/50">
                <button 
                    className="btn btn-sm btn-ghost hover:bg-base-200 rounded-lg font-normal" 
                    onClick={onClose} 
                    disabled={loading}
                >
                    Cancel
                </button>
                <button 
                    className="btn btn-sm btn-primary rounded-lg px-6 shadow-sm" 
                    onClick={handleSave} 
                    disabled={loading}
                >
                    {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Save Changes'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}