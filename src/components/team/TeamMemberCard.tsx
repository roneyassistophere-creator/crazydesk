import { MemberProfile } from '@/types/team';
import { User, Clock, Edit2, Briefcase, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface TeamMemberCardProps {
  member: MemberProfile;
  onClick: () => void;
  onEdit: () => void;
}

export default function TeamMemberCard({ member, onClick, onEdit }: TeamMemberCardProps) {
  const { profile } = useAuth();
  
  const canEdit = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';
  const isMe = profile?.uid === member.uid;
  
  // Status Logic
  const activeNow = member.isOnline; // In a real app, calculate this based on time slots + current time

  // Calculate "Next Available" text and properties
  const getAvailabilityStatus = () => {
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sunday
      const daysMap: Record<string, number> = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 
        'Thursday': 4, 'Friday': 5, 'Saturday': 6
      };
      
      const currentMinutesFromMidnight = now.getHours() * 60 + now.getMinutes();
      const currentDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDay];

      // LOGIC FOR "CURRENTLY IN SLOT"
      if (member.availableSlots && member.availableSlots.length > 0) {
         const currentSlot = member.availableSlots.find(slot => {
            if (slot.day !== currentDayName) return false;
            const [startH, startM] = slot.startTime.split(':').map(Number);
            const [endH, endM] = slot.endTime.split(':').map(Number);
            const startMins = startH * 60 + startM;
            const endMins = endH * 60 + endM;
            return currentMinutesFromMidnight >= startMins && currentMinutesFromMidnight < endMins;
         });

         if (currentSlot && currentSlot.endTime) {
            const parts = currentSlot.endTime.split(':');
            if (parts.length === 2) {
                const [endH, endM] = parts.map(Number);
                const endMins = endH * 60 + endM;
                const minsRemaining = endMins - currentMinutesFromMidnight;
                const hours = Math.floor(minsRemaining / 60);
                const mins = minsRemaining % 60;
                
                const text = hours > 0 ? `for ${hours}h ${mins}m` : `for ${mins}m`;
                return { text, type: 'current', minutesDiff: 0 };
            }
         }
      }

      // Logic for NEXT AVAILABLE
      if (!member.availableSlots || member.availableSlots.length === 0) {
          return { text: "Not set", type: 'unset', minutesDiff: Infinity };
      }

      let closestSlot = null;
      let minMinutesDiff = Infinity;

      member.availableSlots.forEach(slot => {
          const slotDayIndex = daysMap[slot.day];
          const [slotHour, slotMinute] = slot.startTime.split(':').map(Number);
          
          let diffDays = slotDayIndex - currentDay;
          if (diffDays < 0) diffDays += 7;
          
          // Calculate minutes from start of today (00:00) to slot time
          const slotMinutesFromMidnight = slotHour * 60 + slotMinute;
          
          let minutesUntil = (diffDays * 24 * 60) + (slotMinutesFromMidnight - currentMinutesFromMidnight);
          
          // If the slot is earlier today, move it to next week
          if (minutesUntil <= 0) {
              minutesUntil += 7 * 24 * 60;
          }

          if (minutesUntil < minMinutesDiff) {
              minMinutesDiff = minutesUntil;
              closestSlot = slot;
          }
      });

      if (!closestSlot) {
          return { text: "Not set", type: 'unset', minutesDiff: Infinity };
      }

      const hoursUntil = Math.floor(minMinutesDiff / 60);
      const daysUntil = Math.floor(hoursUntil / 24);

      let text = '';
      if (minMinutesDiff < 60) text = `in ${minMinutesDiff} mins`;
      else if (hoursUntil < 24) text = `in ${hoursUntil} hours`;
      else if (daysUntil === 1) text = `Tomorrow`;
      else text = `in ${daysUntil} days`;

      return { text, type: 'future', minutesDiff: minMinutesDiff };
  };
  
  const status = getAvailabilityStatus();

  const getStatusColorClass = () => {
    if (status.type === 'current') return 'text-success';
    if (status.type === 'unset') return 'text-base-content/50';

    // Future logic
    const hours = status.minutesDiff / 60;
    if (hours < 2) return 'text-success';
    if (hours < 5) return 'text-warning';
    return 'text-base-content/30'; // Greyed out for > 5 hours
  };

  // Card styling based on state
  const getCardStyle = () => {
    if (isMe) return "bg-linear-to-br from-primary/15 via-base-200 to-base-200 border-primary/40 hover:shadow-primary/20 hover:border-primary shadow-md";
    if (activeNow) return "bg-linear-to-br from-success/15 via-base-200 to-base-200 border-success/40 hover:shadow-success/20 hover:border-success shadow-md";
    return "bg-base-200 border-base-300 hover:border-base-content/20 hover:shadow-lg shadow-sm";
  };

  return (
    <div 
        onClick={onClick}
        className={`
            relative group rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden p-0.5
            hover:-translate-y-1
            ${getCardStyle()}
        `}
    >
        {/* Helper for specific "Me" styling */}
        {isMe && (
            <div className="absolute top-0 right-0 z-20">
                <div className="bg-primary text-primary-content text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm">
                    YOU
                </div>
            </div>
        )}

        {/* Inner Card Content */}
        <div className="bg-base-100/60 backdrop-blur-xs rounded-xl p-5 h-full flex flex-col relative z-10">
            
            {/* Header Section: Avatar & Status */}
            <div className="flex items-start justify-between mb-4">
                <div className={`avatar ${activeNow ? 'online' : 'placeholder'}`}>
                    <div className="w-14 h-14 rounded-full ring-2 ring-base-content/10 shadow-md bg-neutral text-neutral-content relative overflow-hidden">
                        {/* Fallback initials - rendered first, behind image */}
                        <div className="absolute inset-0 flex items-center justify-center z-0">
                            <span className="text-xl font-bold uppercase">
                                {member.displayName?.[0] || '?'}
                            </span>
                        </div>
                        {member.photoURL ? (
                            <img 
                                src={member.photoURL} 
                                alt={member.displayName || 'User'}
                                className="object-cover w-full h-full absolute inset-0 z-10"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                }} 
                            />
                        ) : null}
                    </div>
                </div>

                {/* Top Right Actions */}
                <div className="flex flex-col items-end gap-2">
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${activeNow ? 'bg-success/10 text-success border-success/20' : 'bg-base-200 text-base-content/40 border-transparent'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${activeNow ? 'bg-success animate-pulse' : 'bg-base-content/30'}`} />
                        {activeNow ? 'Online' : 'Offline'}
                    </div>
                </div>
            </div>

            {/* Content Section: Name & Role */}
            <div className="mb-4">
                <h3 className="font-bold text-lg text-base-content leading-tight mb-1 truncate group-hover:text-primary transition-colors">
                    {member.displayName}
                </h3>
                <div className="flex items-center gap-1.5 text-xs font-medium text-base-content/60 uppercase tracking-widest">
                    <Briefcase size={10} />
                    <span className="truncate">{member.jobTitle || 'Team Member'}</span>
                </div>
            </div>

            {/* Footer Section: Availability & Actions */}
            <div className="mt-auto pt-3 border-t border-base-content/5 flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-base-content/40 mb-0.5">Availability</span>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-base-content/80">
                        <Clock size={12} className={activeNow ? 'text-success' : 'text-base-content/40'} />
                        {/* Always show the calculated slot status, regardless of checks in/out */}
                        <span>
                            {status.type === 'current' ? (
                                <span className={`font-medium ${getStatusColorClass()}`}>Now <span className="text-[10px] ml-1 opacity-70">({status.text})</span></span>
                            ) : (
                                <span className={getStatusColorClass()}>{status.text}</span>
                            )}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Standalone WhatsApp Button - Always Visible & Prominent */}
                    {member.whatsapp && (
                        <a 
                            href={`https://wa.me/${member.whatsapp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="btn btn-circle btn-sm bg-success/10 text-success hover:bg-success hover:text-white border-none shadow-sm transition-all z-20"
                            title="Chat on WhatsApp"
                        >
                            <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                width="18" 
                                height="18" 
                                viewBox="0 0 24 24" 
                                fill="currentColor" 
                                className="w-5 h-5"
                            >
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                            </svg>
                        </a>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0 duration-300">
                        {canEdit && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                className="btn btn-circle btn-xs btn-ghost hover:bg-base-content/10 hover:text-primary transition-colors"
                                title="Edit"
                            >
                                <Edit2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Background Decoration */}
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-linear-to-br from-base-content/5 to-transparent rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-transform duration-500" />
        </div>
    </div>
  );
}