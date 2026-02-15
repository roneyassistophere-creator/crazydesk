'use client';

import { Meeting } from '@/types/meeting';
import { Calendar, Clock, ExternalLink, User, Users, Edit2, Trash2, Megaphone, Video } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';

interface MeetingListCardProps {
  meeting: Meeting;
  compact?: boolean; // For dashboard view
  onEdit?: (meeting: Meeting) => void;
  onDelete?: (meetingId: string) => void;
}

export default function MeetingListCard({ meeting, compact = false, onEdit, onDelete }: MeetingListCardProps) {
  const { user } = useAuth();
  
  const isCreator = user?.uid === meeting.createdBy.uid;
  const date = meeting.scheduledAt?.toDate();
  
  // Safe formatting
  const dateStr = date ? format(date, 'MMM d') : 'TBD';
  const fullDateStr = date ? format(date, 'MMM d, yyyy') : 'Date TBD';
  const timeStr = date ? format(date, 'h:mm a') : 'TBD';

  if (compact) {
    return (
      <div className="stats shadow bg-success text-success-content h-full w-full relative overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-default">
          {/* Background decoration */}
          <div className="absolute -right-6 -top-6 opacity-10">
              <Megaphone size={100} className="rotate-12" />
          </div>

          <div className="stat p-4 relative z-10">
              <div className="stat-figure text-success-content opacity-90">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-[pulse_3s_ease-in-out_infinite]">
                    <Megaphone size={20} className="text-white" />
                  </div>
              </div>
              
              <div className="stat-title text-success-content/80 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={12} /> {fullDateStr}
              </div>
              
              <div className="stat-value text-xl md:text-2xl leading-tight mt-1 truncate pr-2 font-black" title={meeting.title}>
                  {meeting.title}
              </div>
              
              <div className="stat-desc text-success-content/90 mt-2 flex items-center justify-between font-medium"> 
                  <div className="flex items-center gap-2">
                    <Clock size={12} />
                    <span className="text-sm">{timeStr}</span>
                  </div>
                  
                  {meeting.meetingLink && (
                      <a 
                          href={meeting.meetingLink} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn btn-xs md:btn-sm btn-circle bg-white text-success border-none hover:bg-white/90 shadow-sm"
                          title="Join Meeting"
                      >
                          <Video size={14} />
                      </a>
                  )}
              </div>
          </div>
          
          {/* Host Tag */}
           {isCreator && (
              <div className="absolute top-0 left-0 bg-white/20 px-2 py-0.5 rounded-br-lg">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Host</span>
              </div>
          )}
      </div>
    );
  }

  return (
    <div className='card bg-primary text-primary-content shadow-sm border border-base-200 hover:shadow-md transition-shadow group relative'>
      <div className='card-body p-5 gap-2'>
            {/* Full Card Layout (Meetings Page) */}
            <>
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <h3 className="font-bold text-lg leading-tight">{meeting.title}</h3>
                    {meeting.description && (
                      <p className="text-primary-content/80 text-sm mt-1 line-clamp-2">{meeting.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                      {isCreator && (
                        <>
                            <button onClick={() => onEdit?.(meeting)} className="btn btn-ghost btn-sm btn-circle text-primary-content hover:bg-white/10" title="Edit">
                                <Edit2 size={16} />
                            </button>
                            <button onClick={() => onDelete?.(meeting.id)} className="btn btn-ghost btn-sm btn-circle text-primary-content hover:bg-white/10 hover:text-red-200" title="Delete">
                                <Trash2 size={16} />
                            </button>
                        </>
                      )}
                      
                  </div>
                </div>

                {/* Schedule */}
                <div className="flex items-center gap-4 text-primary-content/80 mt-2">
                    <div className="flex items-center gap-1.5">
                        <Calendar size={14} />
                        <span>{fullDateStr}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Clock size={14} />
                        <span>{timeStr}</span>
                    </div>
                </div>

                {/* Creator / Participants info */}
                <div className="flex items-center justify-between border-t border-primary-content/20 pt-3 mt-3 relative">
                    <div className="flex items-center gap-1.5 text-primary-content/80">
                        <div className="avatar placeholder">
                            <div className="rounded-full w-5 bg-primary-content/20 text-primary-content">
                                 <span className="text-[9px]">{meeting.createdBy.displayName?.[0] || 'U'}</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Hosted by</span>
                            <span className="font-medium text-sm">
                                {isCreator ? 'You' : meeting.createdBy.displayName}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {isCreator && (
                            <span className="badge badge-sm badge-ghost border-primary-content/20 text-primary-content">Host</span>
                        )}

                        {meeting.meetingLink && (
                            <a 
                                href={meeting.meetingLink} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="btn btn-secondary btn-sm gap-1"
                            >
                                Join
                                <ExternalLink size={12} />
                            </a>
                        )}
                    </div>
                </div>
                
                <div 
                    className="mt-2 text-xs text-primary-content/60 flex items-center gap-1 w-fit tooltip tooltip-bottom before:max-w-xs before:content-[attr(data-tip)] before:whitespace-pre-line cursor-help"
                    data-tip={meeting.participantDetails?.length ? meeting.participantDetails.map(p => p.displayName).join('\n') : 'No participants'}
                >
                    <Users size={12} />
                    <span className="hover:underline decoration-dashed decoration-primary-content/40 underline-offset-2">
                        {meeting.participantDetails?.length || 0} participants invited
                    </span>
                </div>
            </>
      </div>
    </div>
  );
}
