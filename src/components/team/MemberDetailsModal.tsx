import { MemberProfile } from '@/types/team';
import { X, Clock, Briefcase, Calendar, Mail, Shield } from 'lucide-react';

interface MemberDetailsModalProps {
  member: MemberProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function MemberDetailsModal({ member, isOpen, onClose }: MemberDetailsModalProps) {
  if (!isOpen || !member) return null;

  const active = member.isOnline;

  // Helper to format 24h to 12h
  const formatTime = (time24?: string) => {
    if(!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header / Cover */}
        <div className="h-32 bg-base-200/50 w-full relative border-b border-base-200">
             <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-secondary/5"></div>
             <button 
                onClick={onClose} 
                className="absolute top-3 right-3 btn btn-circle btn-sm btn-ghost bg-base-100/50 hover:bg-base-100 border border-base-content/5 z-20 shadow-sm"
             >
                <X size={18} />
             </button>
        </div>

        {/* Profile Info Section within negative margin */}
        <div className="px-6 relative flex flex-col flex-1 overflow-hidden">
             
             {/* Avatar & Basic Info Row */}
             <div className="flex flex-col items-center -mt-12 mb-6 z-10">
                 <div className="avatar placeholder mb-3">
                    <div className="w-24 h-24 rounded-full ring-4 ring-base-100 bg-neutral text-neutral-content shadow-lg flex items-center justify-center">
                        <span className="text-3xl font-bold">{member.displayName?.[0]}</span>
                    </div>
                    <div className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-4 border-base-100 ${active ? 'bg-success' : 'bg-base-300'}`}></div>
                 </div>
                 
                 <h2 className="text-2xl font-bold text-base-content text-center leading-tight">
                    {member.displayName}
                 </h2>
                 <p className="text-base-content/60 font-medium text-sm flex items-center gap-1.5 mt-1">
                    <Briefcase size={14} />
                    {member.jobTitle || 'Team Member'}
                 </p>
                 
                 <div className="flex gap-2 mt-3">
                     <span className={`badge ${active ? 'badge-success badge-outline' : 'badge-ghost'} gap-1 pl-1.5 pr-2.5`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-success' : 'bg-base-content/30'}`}></div>
                        {active ? 'Online Now' : 'Offline'}
                     </span>
                     <span className="badge badge-ghost gap-1 pl-1.5 pr-2.5 uppercase text-[10px] font-bold tracking-wider text-base-content/40 border-base-content/10">
                        {member.role || 'MEMBER'}
                     </span>
                 </div>
             </div>

             {/* Content Scrollable Area */}
             <div className="flex-1 overflow-y-auto px-1 pb-6 space-y-6 scrollbar-none">
                 
                 {/* 1. Scope of Work / Bio */}
                 <div className="bg-base-200/50 rounded-xl p-4 border border-base-200">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40 mb-3 flex items-center gap-2">
                        About / Scope
                    </h3>
                    {member.scopeOfWork ? (
                        <p className="text-sm leading-relaxed text-base-content/80 whitespace-pre-line">
                            {member.scopeOfWork}
                        </p>
                    ) : (
                        <p className="text-sm italic text-base-content/40">No role description details available.</p>
                    )}
                 </div>

                 {/* 2. Availability Schedule */}
                 <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40 mb-3 flex items-center gap-2">
                        <Clock size={14} />
                        Schedule
                    </h3>
                    
                    {(!member.availableSlots || member.availableSlots.length === 0) ? (
                        <div className="text-center py-6 bg-base-200/30 rounded-xl border border-dashed border-base-300">
                            <p className="text-sm text-base-content/50">No schedule confirmed.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {member.availableSlots.map((slot, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-base-100 border border-base-200 hover:border-base-300 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-base-200 text-base-content/70 flex items-center justify-center font-bold text-xs">
                                            {slot.day.substring(0, 1)}
                                        </div>
                                        <span className="font-medium text-sm text-base-content/80">{slot.day}</span>
                                    </div>
                                    <div className="text-sm font-mono bg-base-200/50 px-2 py-1 rounded text-base-content/70">
                                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
                 
                 {/* Contact / Meta Info */}
                 <div className="border-t border-base-200 pt-4 mt-2">
                     <a href={`mailto:${member.email}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200/50 transition-colors group cursor-pointer text-base-content/60 hover:text-primary">
                        <div className="w-8 h-8 rounded-full bg-base-200 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <Mail size={14} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold uppercase tracking-wider opacity-50">Email Address</span>
                            <span className="text-sm font-medium">{member.email}</span>
                        </div>
                     </a>
                 </div>

             </div>
        </div>
      </div>
    </div>
  );
}