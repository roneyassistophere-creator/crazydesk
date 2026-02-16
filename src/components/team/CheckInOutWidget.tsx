import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, where, orderBy, limit, arrayUnion, Timestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { Clock, Download, CheckCircle, XCircle, Link as LinkIcon, Coffee, Play } from 'lucide-react';
import { WorkLog } from '@/types/workLog';

import { MemberProfile } from '@/types/team';

interface CheckInOutWidgetProps {
    onStatusChange?: (isOnline: boolean) => void;
    compact?: boolean;
}

export default function CheckInOutWidget({ onStatusChange, compact = false }: CheckInOutWidgetProps) {
    const { user, profile } = useAuth();
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [isOnBreak, setIsOnBreak] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [checkInTime, setCheckInTime] = useState<Date | null>(null);
    const [breakStartTime, setBreakStartTime] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportText, setReportText] = useState('');
    const [proofLink, setProofLink] = useState('');
    const [loading, setLoading] = useState(false);
    const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
    const [actionTimerText, setActionTimerText] = useState('');

    // Schedule Timer
    useEffect(() => {
        const memberProfile = profile as unknown as MemberProfile;
        if (!memberProfile?.availableSlots || memberProfile.availableSlots.length === 0) {
            setActionTimerText('');
            return;
        }

        const updateTimer = () => {
             const now = new Date();
             const currentDayIndex = now.getDay(); 
             const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
             const currentDayName = days[currentDayIndex];
             const currentMins = now.getHours() * 60 + now.getMinutes();

             // Helper to parse "HH:MM"
             const parseTime = (t: string) => {
                 const [h, m] = t.split(':').map(Number);
                 return h * 60 + m;
             };

             // 1. Check if currently inside a slot
             // Use explicit cast for filtering
             const slots = memberProfile.availableSlots || [];
             const currentSlot = slots.find((slot: any) => {
                if (slot.day !== currentDayName) return false;
                const start = parseTime(slot.startTime);
                const end = parseTime(slot.endTime);
                return currentMins >= start && currentMins < end;
             });

             if (isCheckedIn) {
                 // TARGET: Check Out Time (End of current slot)
                 if (currentSlot) {
                     const end = parseTime(currentSlot.endTime);
                     const diff = end - currentMins;
                     if (diff > 0) {
                         const h = Math.floor(diff / 60);
                         const m = diff % 60;
                         setActionTimerText(`(in ${h}h ${m}m)`);
                     } else {
                         setActionTimerText('(Overtime)');
                     }
                 } else {
                     // Not in a slot but checked in -> Overtime
                     setActionTimerText('(Overtime)');
                 }
             } else {
                 // TARGET: Check In Time (Start of next slot)
                 
                 // If current slot exists, we are LATE or working?
                 if (currentSlot) {
                     const end = parseTime(currentSlot.endTime);
                     const diff = end - currentMins;
                     const h = Math.floor(diff / 60);
                     const m = diff % 60;
                     setActionTimerText(`(Shift ends in ${h}h ${m}m)`);
                 } else {
                     // Find next future slot
                     let minDiff = Infinity;
                     
                     slots.forEach((slot: any) => {
                        const slotDayIndex = days.indexOf(slot.day);
                        const start = parseTime(slot.startTime);
                        
                        let dayDiff = slotDayIndex - currentDayIndex;
                        if (dayDiff < 0) dayDiff += 7; // Next week
                         
                        // If same day but time passed, move to next week
                        let diffMins = (dayDiff * 24 * 60) + (start - currentMins);
                        
                        if (diffMins <= 0) {
                             diffMins += 7 * 24 * 60;
                        }

                        if (diffMins < minDiff) {
                            minDiff = diffMins;
                        }
                     });

                     if (minDiff !== Infinity) {
                         const daysUntil = Math.floor(minDiff / (24 * 60));
                         const h = Math.floor((minDiff % (24 * 60)) / 60);
                         const m = minDiff % 60;
                         
                         if (daysUntil > 0) {
                             setActionTimerText(`(in ${daysUntil}d ${h}h)`);
                         } else {
                             setActionTimerText(`(in ${h}h ${m}m)`);
                         }
                     } else {
                         setActionTimerText('');
                     }
                 }
             }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);

    }, [profile, isCheckedIn]);

    // Initial check for active session
    useEffect(() => {
        if (!user) return;

        const checkActiveSession = async () => {
            try {
                // Check if user has an active session
                const logsRef = collection(db, 'work_logs');
                const q = query(
                    logsRef, 
                    where('userId', '==', user.uid), 
                    where('status', 'in', ['active', 'break']),
                    limit(1)
                );
                const snapshot = await getDocs(q);
                
                if (!snapshot.empty) {
                    const activeLog = snapshot.docs[0].data() as WorkLog;
                    const logId = snapshot.docs[0].id;
                    
                    setIsCheckedIn(true);
                    setCurrentSessionId(logId);
                    
                    // Set status
                    const isBreak = activeLog.status === 'break';
                    setIsOnBreak(isBreak);

                    // Times and Durations
                    const startTime = activeLog.checkInTime.toDate();
                    setCheckInTime(startTime);

                    // Calculate total break time from completed breaks
                    let historicalBreakSeconds = 0;
                    if (activeLog.breaks) {
                         historicalBreakSeconds = activeLog.breaks.reduce((acc, b) => {
                             if (b.endTime && b.startTime) {
                                 const start = b.startTime.toDate().getTime();
                                 const end = b.endTime.toDate().getTime();
                                 return acc + Math.floor((end - start) / 1000);
                             }
                             return acc;
                         }, 0);
                    }
                    setTotalBreakSeconds(historicalBreakSeconds);

                    // If currently on break, set break start time
                    if (isBreak && activeLog.breaks && activeLog.breaks.length > 0) {
                        const lastBreak = activeLog.breaks[activeLog.breaks.length - 1];
                        if (!lastBreak.endTime) {
                            setBreakStartTime(lastBreak.startTime.toDate());
                        }
                    }

                } else {
                    setIsCheckedIn(false);
                    setIsOnBreak(false);
                }
            } catch (error) {
                console.error("Error checking active session:", error);
            }
        };

        checkActiveSession();
    }, [user]);

    // Timer effect
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCheckedIn && checkInTime) {
            interval = setInterval(() => {
                const now = new Date();
                
                // If on break, we don't increment the "elapsed WORK time" relative to now
                // Instead, we show break time ticking? Or just pause work timer?
                // User asked: "taking a break counts altogether just in the report log it shows the break time if taken"
                // Usually check-in timer shows "Time since check-in minus break time".
                
                // Calculate current break duration if active
                let currentBreakSeconds = 0;
                if (breakStartTime) {
                    currentBreakSeconds = Math.floor((now.getTime() - breakStartTime.getTime()) / 1000);
                }

                // Total elapsed since checkin
                const totalElapsed = Math.floor((now.getTime() - checkInTime.getTime()) / 1000);
                
                // Effective work time = Total elapsed - (Historical Breaks + Current Break)
                const effectiveWorkValues = totalElapsed - (totalBreakSeconds + currentBreakSeconds);
                
                setElapsedTime(effectiveWorkValues > 0 ? effectiveWorkValues : 0);

            }, 1000);
        } else {
            setElapsedTime(0);
        }
        return () => clearInterval(interval);
    }, [isCheckedIn, checkInTime, isOnBreak, breakStartTime, totalBreakSeconds]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleCheckIn = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const newLog = {
                userId: user.uid,
                userDisplayName: profile?.displayName || user.email || 'User',
                checkInTime: serverTimestamp(),
                status: 'active' as const,
                breaks: []
            };

            const docRef = await addDoc(collection(db, 'work_logs'), newLog);
            
            await updateDoc(doc(db, 'member_profiles', user.uid), {
                isOnline: true,
                lastActive: serverTimestamp()
            });

            setIsCheckedIn(true);
            setIsOnBreak(false);
            setCurrentSessionId(docRef.id);
            setCheckInTime(new Date());
            setTotalBreakSeconds(0);
            toast.success("Checked in successfully!");
            onStatusChange?.(true);

        } catch (error) {
            console.error("Check-in failed:", error);
            toast.error("Failed to check in");
        } finally {
            setLoading(false);
        }
    };

    const handleTakeBreak = async () => {
        if (!user || !currentSessionId) return;
        setLoading(true);
        try {
            // Append a new break entry with startTime
            const breakStart = new Date();
            const newBreak = { startTime: Timestamp.fromDate(breakStart) };
            
            await updateDoc(doc(db, 'work_logs', currentSessionId), {
                status: 'break',
                breaks: arrayUnion(newBreak)
            });
            
            setIsOnBreak(true);
            setBreakStartTime(breakStart);
            toast.success("Break started. Enjoy your coffee!");

        } catch (error) {
            console.error("Break start failed:", error);
            toast.error("Failed to start break");
        } finally {
            setLoading(false);
        }
    };

    const handleResumeWork = async () => {
        if (!user || !currentSessionId || !breakStartTime) return;
        setLoading(true);
        try {
            const resumeTime = new Date();
            
            // We need to update the LAST break entry (the open one)
            // Firestore arrayUnion adds unique elements, we can't easily update a specific index without reading first.
            // Since we rely on local state for UX, reading again is safest for data integrity.
            
            const logRef = doc(db, 'work_logs', currentSessionId);
            const logSnap = await getDocs(query(collection(db, 'work_logs'), where('__name__', '==', currentSessionId))); // Get explicit doc
            // Actually getDoc is better but I'm in a hurry with imports? No I have getDocs. 
            // Let's use getDocs with ID query or just rely on array manipulation strategy.
            // Strategy: Read current breaks, update last one, write back entire array.
            
            // Re-fetch to be safe
            // Wait, I can use the same pattern as before? No.
            // Let's just fetch the doc data.
            // I need to import getDoc. I have getDocs. I'll use getDocs with generic query or ref.
            // Actually, I can just use arrayRemove / arrayUnion if I knew the exact object, but I don't know the server timestamp.
            // BETTER: Read the document, modify array, write back.
            // But I don't have GetDoc imported? I see getDocs.
            // I'll add getDoc to imports if not there? 
            // Looking at previous imports: `getDocs`. 
            // I will use `runTransaction` or just fetch.
            
            // Quick fetch using existing imports
            const q = query(collection(db, 'work_logs'), where('__name__', '==', currentSessionId));
            const snap = await getDocs(q);
            if (snap.empty) throw new Error("Session not found");
            
            const data = snap.docs[0].data() as WorkLog;
            const breaks = data.breaks || [];
            
            if (breaks.length > 0) {
                const lastBreak = breaks[breaks.length - 1];
                if (!lastBreak.endTime) {
                    // Update the local object
                    lastBreak.endTime = Timestamp.fromDate(resumeTime);
                    // Calculate duration
                    const diffMinutes = Math.round((resumeTime.getTime() - breakStartTime.getTime()) / 60000);
                    lastBreak.durationMinutes = diffMinutes;
                }
            }

            // Write back complete array
            await updateDoc(logRef, {
                status: 'active',
                breaks: breaks
            });

            // Update local state
            const breakDurationSeconds = Math.floor((resumeTime.getTime() - breakStartTime.getTime()) / 1000);
            setTotalBreakSeconds(prev => prev + breakDurationSeconds);
            
            setIsOnBreak(false);
            setBreakStartTime(null);
            toast.success("Welcome back!");

        } catch (error) {
            console.error("Resume failed:", error);
            toast.error("Failed to resume work");
        } finally {
            setLoading(false);
        }
    };

    const handleCheckOutClick = () => {
        // If on break, allow checkout but warn? Or auto-resume?
        // Let's auto-end the break if currently on break.
        setShowReportModal(true);
    };

    const confirmCheckOut = async () => {
        if (!user || !currentSessionId) return;
        setLoading(true);
        try {
            const checkOutTime = new Date();
            let finalBreaks: any[] = [];
            let addedBreakSeconds = 0;

            // Prepare final data logic
            // If on break, we need to close the break first
            if (isOnBreak && breakStartTime) {
                 // Fetch latest to get array
                 const q = query(collection(db, 'work_logs'), where('__name__', '==', currentSessionId));
                 const snap = await getDocs(q);
                 if (!snap.empty) {
                     const data = snap.docs[0].data() as WorkLog;
                     finalBreaks = data.breaks || [];
                     if (finalBreaks.length > 0) {
                        const lastBreak = finalBreaks[finalBreaks.length - 1];
                        if (!lastBreak.endTime) {
                            lastBreak.endTime = Timestamp.fromDate(checkOutTime);
                            lastBreak.durationMinutes = Math.round((checkOutTime.getTime() - breakStartTime.getTime()) / 60000);
                            addedBreakSeconds = Math.floor((checkOutTime.getTime() - breakStartTime.getTime()) / 1000);
                        }
                     }
                 }
            }

            // Calculate totals
            const totalDurationRaw = checkInTime ? Math.round((checkOutTime.getTime() - checkInTime.getTime()) / 60000) : 0;
            const totalBreakMin = Math.round((totalBreakSeconds + addedBreakSeconds) / 60);
            const netDuration = totalDurationRaw - totalBreakMin;

            const updateData: any = {
                checkOutTime: serverTimestamp(),
                report: reportText,
                attachments: proofLink ? [proofLink] : [],
                durationMinutes: netDuration > 0 ? netDuration : 0,
                breakDurationMinutes: totalBreakMin,
                status: 'completed'
            };

            if (isOnBreak) {
                updateData.breaks = finalBreaks;
            }

            await updateDoc(doc(db, 'work_logs', currentSessionId), updateData);
            await updateDoc(doc(db, 'member_profiles', user.uid), {
                isOnline: false,
                lastActive: serverTimestamp()
            });

            setIsCheckedIn(false);
            setIsOnBreak(false);
            setCurrentSessionId(null);
            setCheckInTime(null);
            setReportText('');
            setProofLink('');
            setShowReportModal(false);
            setTotalBreakSeconds(0);
            toast.success("Checked out successfully!");
            onStatusChange?.(false);

        } catch (error) {
            console.error("Check-out failed:", error);
            toast.error("Failed to check out");
        } finally {
            setLoading(false);
        }
    };

    if (compact) {
        return (
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1 bg-base-200 rounded-full font-mono text-xs font-bold border border-base-300">
                    <div className={`w-2 h-2 rounded-full ${isCheckedIn ? (isOnBreak ? 'bg-warning' : 'bg-success animate-pulse') : 'bg-base-content/20'}`}></div>
                    <span className={isOnBreak ? 'opacity-50' : ''}>{formatDuration(elapsedTime)}</span>
                </div>
    
                {!isCheckedIn ? (
                    <button 
                        onClick={handleCheckIn} 
                        disabled={loading}
                        className="btn btn-success btn-sm gap-2 shadow-sm font-bold"
                    >
                        <Clock size={14} />
                        {loading ? 'Checking in...' : `Check In`}
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        {!isOnBreak ? (
                            <button 
                                onClick={handleTakeBreak}
                                disabled={loading}
                                className="btn btn-warning btn-outline btn-sm gap-2 font-bold"
                                title="Tak work timer)"
                            >
                                <Coffee size={14} />
                                <span className="hidden sm:inline">Break</span>
                            </button>
                        ) : (
                            <button 
                                onClick={handleResumeWork}
                                disabled={loading}
                                className="btn btn-success btn-outline btn-sm gap-2 font-bold"
                                title="Resume work"
                            >
                                <Play size={14} />
                                <span className="hidden sm:inline">Resume</span>
                            </button>
                        )}
                        
                        <button 
                            onClick={handleCheckOutClick}
                            disabled={loading} 
                            className="btn btn-error btn-outline btn-sm gap-2 font-bold"
                            title={actionTimerText}
                        >
                            <Download size={14} className="rotate-180" />
                            <span className="truncate hidden sm:inline">Check Out</span>
                        </button>
                    </div>
                )}
                 {/* Check Out Modal */}
            {showReportModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in duration-200">
                    <div className="bg-base-100 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-base-200">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                           <CheckCircle className="text-success" size={24}/> Check Out & Report
                        </h3>
                        
                        <div className="form-control mb-4">
                            <label className="label">
                                <span className="label-text font-medium">Session Summary</span>
                                <span className="label-text-alt opacity-60">What did you achieve?</span>
                            </label>
                            <textarea 
                                className="textarea textarea-bordered h-32 focus:border-primary" 
                                placeholder="- Completed Task A&#10;- Fixed bug in module B&#10;- Reviewed PRs"
                                value={reportText}
                                onChange={(e) => setReportText(e.target.value)}
                            ></textarea>
                        </div>
                        
                        {/* Optional: Attachment UI can go here later */}
                        <div className="form-control mb-6">
                            <label className="label cursor-pointer justify-start gap-4">
                                <LinkIcon size={16} />
                                <span className="label-text font-medium">Proof of Work (Link)</span>
                            </label>
                            <input 
                                type="url"
                                className="input input-bordered w-full focus:border-primary"
                                placeholder="https://..."
                                value={proofLink}
                                onChange={(e) => setProofLink(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button 
                                className="btn btn-ghost"
                                onClick={() => setShowReportModal(false)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={confirmCheckOut}
                                disabled={loading || !reportText.trim()}
                            >
                                {loading ? <span className="loading loading-spinner"></span> : 'Check Out'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            <div className={`flex items-center justify-center gap-3 px-6 py-2 bg-base-200/50 rounded-xl font-mono text-xl font-bold border border-base-300 w-full ${!isCheckedIn ? 'opacity-50 grayscale' : ''}`}>
                <div className={`w-3 h-3 rounded-full ${isCheckedIn ? (isOnBreak ? 'bg-warning' : 'bg-success animate-pulse') : 'bg-base-content/20'}`}></div>
                <span className={isOnBreak ? 'opacity-50' : ''}>{formatDuration(elapsedTime)}</span>
                {isOnBreak && <span className="badge badge-warning badge-sm font-bold uppercase ml-2">Break</span>}
            </div>

            {!isCheckedIn ? (
                <button 
                    onClick={handleCheckIn} 
                    disabled={loading}
                    className="btn btn-success w-full gap-2 shadow-lg hover:shadow-success/30 transition-all font-bold"
                >
                    <Clock size={18} />
                    {loading ? 'Checking in...' : `Check In ${actionTimerText}`}
                </button>
            ) : (
                <div className="grid grid-cols-2 gap-3 w-full">
                    {!isOnBreak ? (
                        <button 
                            onClick={handleTakeBreak}
                            disabled={loading}
                            className="btn btn-warning btn-outline gap-2 font-bold"
                            title="Take a break (stops work timer)"
                        >
                            <Coffee size={18} />
                            Break
                        </button>
                    ) : (
                        <button 
                            onClick={handleResumeWork}
                            disabled={loading}
                            className="btn btn-success btn-outline gap-2 font-bold"
                            title="Resume work"
                        >
                            <Play size={18} />
                            Resume
                        </button>
                    )}
                    
                    <button 
                        onClick={handleCheckOutClick}
                        disabled={loading} 
                        className="btn btn-error btn-outline gap-2 font-bold px-2"
                        title={actionTimerText}
                    >
                        <Download size={18} className="rotate-180" />
                        <span className="truncate">Check Out {actionTimerText && isCheckedIn ? actionTimerText : ''}</span>
                    </button>
                </div>
            )}

            {/* Check Out Modal */}
            {showReportModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in duration-200">
                    <div className="bg-base-100 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-base-200">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                           <CheckCircle className="text-success" size={24}/> Check Out & Report
                        </h3>
                        
                        <div className="form-control mb-4">
                            <label className="label">
                                <span className="label-text font-medium">Session Summary</span>
                                <span className="label-text-alt opacity-60">What did you achieve?</span>
                            </label>
                            <textarea 
                                className="textarea textarea-bordered h-32 focus:border-primary" 
                                placeholder="- Completed Task A&#10;- Fixed bug in module B&#10;- Reviewed PRs"
                                value={reportText}
                                onChange={(e) => setReportText(e.target.value)}
                            ></textarea>
                        </div>
                        
                        {/* Optional: Attachment UI can go here later */}
                        <div className="form-control mb-6">
                            <label className="label cursor-pointer justify-start gap-4">
                                <LinkIcon size={16} />
                                <span className="label-text font-medium">Proof of Work (Link)</span>
                            </label>
                            <input 
                                type="url"
                                className="input input-bordered w-full focus:border-primary"
                                placeholder="https://..."
                                value={proofLink}
                                onChange={(e) => setProofLink(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button 
                                className="btn btn-ghost"
                                onClick={() => setShowReportModal(false)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={confirmCheckOut}
                                disabled={loading || !reportText.trim()}
                            >
                                {loading ? <span className="loading loading-spinner"></span> : 'Submit Report & Check Out'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
