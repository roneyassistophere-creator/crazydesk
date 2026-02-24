'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { WorkLog } from '@/types/workLog';
import { TimeSlot, MemberProfile, DAYS_OF_WEEK } from '@/types/team';
import { useUsers } from '@/hooks/useUsers';
import UserAvatar from '@/components/common/UserAvatar';
import { 
    format, 
    differenceInMinutes, 
    parse, 
    isSameDay, 
    subDays, 
    isBefore, 
    addHours, 
    startOfDay, 
    endOfDay, 
    startOfWeek, 
    endOfWeek, 
    startOfMonth, 
    endOfMonth, 
    addDays, 
    subWeeks, 
    addWeeks, 
    subMonths, 
    addMonths,
    isWithinInterval
} from 'date-fns';
import { 
    Loader2, 
    FileText, 
    Calendar as CalendarIcon, 
    Clock, 
    CheckCircle, 
    Link as LinkIcon, 
    ExternalLink, 
    AlertTriangle, 
    AlertCircle, 
    XCircle, 
    LogOut, 
    Coffee, 
    ChevronLeft, 
    ChevronRight, 
    CalendarDays,
    Users
} from 'lucide-react';

interface EnhancedLog extends WorkLog {
    isLate?: boolean;
    leftEarly?: boolean;
    forgotCheckout?: boolean;
    isMissed?: boolean;
    scheduleInfo?: string;
    missedDate?: Date;
}

export default function ReportingPage() {
    const { user, profile } = useAuth();
    const { users: approvedUsers, loading: usersLoading } = useUsers();
    const [combinedLogs, setCombinedLogs] = useState<EnhancedLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'daily'|'weekly'|'monthly'>('weekly');
    const [currentDate, setCurrentDate] = useState(new Date());
    const dateInputRef = useRef<HTMLInputElement>(null);

    // Admin/Manager View State
    const [viewingUserId, setViewingUserId] = useState<string>('');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const isAdminOrManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';
    const viewingUser = viewingUserId && viewingUserId !== user?.uid
        ? approvedUsers.find(u => u.uid === viewingUserId)
        : null;
    const teamMembers = approvedUsers.filter(u => u.uid !== user?.uid && u.status === 'approved');

    // Filter Optimization: Store raw data
    const [rawLogs, setRawLogs] = useState<WorkLog[]>([]);
    const [userSchedule, setUserSchedule] = useState<TimeSlot[]>([]);
    const [switchingUser, setSwitchingUser] = useState(false);
    const initialLoadDone = useRef(false);

    // Initialize viewing user ID
    useEffect(() => {
        if (user && !viewingUserId) {
            setViewingUserId(user.uid);
        }
    }, [user, viewingUserId]);

    // Calculate Date Range based on filter and currentDate
    const getDateRange = () => {
        const now = currentDate;
        switch (filter) {
            case 'daily':
                return {
                    start: startOfDay(now),
                    end: endOfDay(now),
                    label: isSameDay(now, new Date()) ? 'Today' : format(now, 'MMMM d, yyyy')
                };
            case 'weekly':
                return {
                    start: startOfWeek(now, { weekStartsOn: 1 }), // Monday start
                    end: endOfWeek(now, { weekStartsOn: 1 }),
                    label: `${format(startOfWeek(now, { weekStartsOn: 1 }), 'MMM d')} - ${format(endOfWeek(now, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
                };
            case 'monthly':
                return {
                    start: startOfMonth(now),
                    end: endOfMonth(now),
                    label: format(now, 'MMMM yyyy')
                };
            default:
                return { start: startOfDay(now), end: endOfDay(now), label: '' };
        }
    };

    const handlePrevious = () => {
        if (filter === 'daily') setCurrentDate(prev => subDays(prev, 1));
        if (filter === 'weekly') setCurrentDate(prev => subWeeks(prev, 1));
        if (filter === 'monthly') setCurrentDate(prev => subMonths(prev, 1));
    };

    const handleNext = () => {
        if (filter === 'daily') setCurrentDate(prev => addDays(prev, 1));
        if (filter === 'weekly') setCurrentDate(prev => addWeeks(prev, 1));
        if (filter === 'monthly') setCurrentDate(prev => addMonths(prev, 1));
    };

    // 1. Initial Data Fetch (Only runs once on mount/user change)
    useEffect(() => {
        if (!user || !viewingUserId) return;

        const fetchData = async () => {
            // Only show full-page spinner on initial load, not user switches
            if (!initialLoadDone.current) {
                setLoading(true);
            } else {
                setSwitchingUser(true);
            }
            try {
                // Fetch User Schedule (Member Profile)
                let schedule: TimeSlot[] = [];
                const profileRef = doc(db, 'member_profiles', viewingUserId);
                const profileSnap = await getDoc(profileRef);
                
                if (profileSnap.exists()) {
                    const profileData = profileSnap.data() as MemberProfile;
                    schedule = profileData.availableSlots || [];
                }
                setUserSchedule(schedule);

                // Fetch Work Logs
                // Fetching all relevant logs for client-side filtering
                const logsRef = collection(db, 'work_logs');
                const q = query(
                    logsRef, 
                    where('userId', '==', viewingUserId)
                );
                
                const snapshot = await getDocs(q);
                const fetchedLogs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as WorkLog[];
                setRawLogs(fetchedLogs);

            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
                setSwitchingUser(false);
                initialLoadDone.current = true;
            }
        };

        fetchData();
    }, [user, viewingUserId]);

    // 2. Process Logs when filter/date changes (Client-side fast filtering)
    useEffect(() => {
        if (!user || loading) return;

        const { start, end } = getDateRange();
        const processed = processLogsAndSchedule(rawLogs, userSchedule, start, end);
        setCombinedLogs(processed);
    }, [user, filter, currentDate, rawLogs, userSchedule, loading]);

    const processLogsAndSchedule = (logs: WorkLog[], schedule: TimeSlot[], rangeStart: Date, rangeEnd: Date): EnhancedLog[] => {
        const now = new Date();
        const result: EnhancedLog[] = [];

        // Helper to find slot for a specific date
        const getSlotForDate = (date: Date) => {
            const dayName = format(date, 'EEEE'); // Monday, Tuesday...
            return schedule.find(s => s.day === dayName);
        };

        // Helper to parse "HH:mm" to Date for a specific day
        const parseTimeOnDate = (timeStr: string, date: Date) => {
            return parse(timeStr, 'HH:mm', date);
        };

        // 1. Analyze Existing Logs (only those within range)
        const analyzedLogs = logs.filter(log => {
             const logDate = log.checkInTime?.toDate();
             if (!logDate) return false;
             return isWithinInterval(logDate, { start: rangeStart, end: rangeEnd });
        }).map(log => {
            const logDate = log.checkInTime?.toDate();
            // ... (rest of analysis logic is mostly same, just checking slot schedule)
            const slot = getSlotForDate(logDate);
            const enhancedLog: EnhancedLog = { ...log };

            if (slot) {
                const scheduledStart = parseTimeOnDate(slot.startTime, logDate);
                const scheduledEnd = parseTimeOnDate(slot.endTime, logDate);

                // Check Late Check-in (grace period 5 mins)
                if (differenceInMinutes(logDate, scheduledStart) > 5) {
                    enhancedLog.isLate = true;
                }

                // Check Early Departure (grace period 5 mins)
                if (log.checkOutTime) {
                    const checkOutDate = log.checkOutTime.toDate();
                    if (differenceInMinutes(scheduledEnd, checkOutDate) > 5) {
                        enhancedLog.leftEarly = true;
                    }
                }

                // Check Forgot Checkout
                if (log.status === 'active') {
                    const fiveHoursAfterEnd = addHours(scheduledEnd, 5);
                    if (isBefore(fiveHoursAfterEnd, now)) {
                        enhancedLog.forgotCheckout = true;
                    }
                }

                enhancedLog.scheduleInfo = `${slot.startTime} - ${slot.endTime}`;
            }

            return enhancedLog;
        });

        // 2. Identify Missed Shifts (Absent) - Iterate through each day in the range
        let loopDate = rangeStart;
        while (loopDate <= rangeEnd && isBefore(loopDate, now)) { // Don't mark future days as missed
            const checkDate = loopDate;
            const Slot = getSlotForDate(checkDate);

            // If there's a schedule for this day
            if (Slot) {
                // Check if we have a log for this day in the analyzed logs
                const hasLog = analyzedLogs.some(log => {
                    const logDate = log.checkInTime?.toDate();
                    return logDate && isSameDay(logDate, checkDate);
                });

                // If no log found, and the day is fully past (end time passed)
                if (!hasLog) {
                    const scheduledEnd = parseTimeOnDate(Slot.endTime, checkDate);
                    
                    // Only mark absent if the shift schedule is completely in the past
                    if (isBefore(scheduledEnd, now)) {
                        result.push({
                            id: `missed-${checkDate.toISOString()}`,
                            userId: viewingUserId,
                            userDisplayName: 'Unknown', // Ideally fetch display name if viewing other users
                            checkInTime: null as any, // Ghost log
                            status: 'completed', // Technically never started
                            isMissed: true,
                            missedDate: checkDate,
                            scheduleInfo: `${Slot.startTime} - ${Slot.endTime}`
                        });
                    }
                }
            }
            loopDate = addDays(loopDate, 1);
        }

        // Combine and Sort
        const allItems = [...analyzedLogs, ...result];
        return allItems.sort((a, b) => {
            const timeA = a.checkInTime?.toDate?.() || a.missedDate || new Date(0);
            const timeB = b.checkInTime?.toDate?.() || b.missedDate || new Date(0);
            return timeB.getTime() - timeA.getTime();
        });
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '-';
        return format(timestamp.toDate(), 'h:mm a');
    };
    
    const formatDate = (date: Date | any) => {
        if (!date) return '-';
        if (date.toDate) return format(date.toDate(), 'MMM d, yyyy');
        return format(date, 'MMM d, yyyy');
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="animate-spin text-primary w-10 h-10" />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
        {/* Main Content */}
        <div className={`flex-1 min-w-0 overflow-y-auto transition-opacity duration-200 ${switchingUser ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        {switchingUser && (
            <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="loading loading-spinner loading-sm text-primary" />
            </div>
        )}
        <div className="max-w-5xl mx-auto">
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                             <h1 className="text-3xl font-bold">Activity Reporting</h1>
                        </div>
                        <p className="text-base-content/60">
                            {viewingUserId === user?.uid 
                                ? "Track your work sessions and daily progress." 
                                : `Viewing activity logs for ${viewingUser?.displayName || 'Team Member'}`
                            }
                        </p>
                    </div>
                    
                    <div className="flex flex-col items-end gap-3">
                        <div className="join self-start sm:self-center bg-base-200/50 p-1 rounded-full border border-base-200 shrink-0">
                            <button className={`join-item btn btn-sm rounded-full border-none px-6 ${filter === 'daily' ? 'bg-white shadow-sm text-primary hover:bg-white' : 'btn-ghost opacity-60 hover:opacity-100 hover:bg-base-200'}`} onClick={()=>setFilter('daily')}>Daily</button>
                            <button className={`join-item btn btn-sm rounded-full border-none px-6 ${filter === 'weekly' ? 'bg-white shadow-sm text-primary hover:bg-white' : 'btn-ghost opacity-60 hover:opacity-100 hover:bg-base-200'}`} onClick={()=>setFilter('weekly')}>Weekly</button>
                            <button className={`join-item btn btn-sm rounded-full border-none px-6 ${filter === 'monthly' ? 'bg-white shadow-sm text-primary hover:bg-white' : 'btn-ghost opacity-60 hover:opacity-100 hover:bg-base-200'}`} onClick={()=>setFilter('monthly')}>Monthly</button>
                        </div>
                    </div>
                </div>

                {/* Date Navigation Slider */}
                <div className="flex items-center justify-center bg-base-100 p-2 rounded-2xl border border-base-200 shadow-sm w-full max-w-sm mx-auto relative group">
                    <button 
                        className="btn btn-ghost btn-circle btn-sm text-base-content/60 hover:bg-base-200 hover:text-primary" 
                        onClick={handlePrevious}
                        title="Previous"
                    >
                        <ChevronLeft size={20}/>
                    </button>
                    
                    <div 
                        className="flex-1 text-center relative px-2 cursor-pointer hover:bg-base-200/50 py-1.5 rounded-xl transition-all group/date" 
                        onClick={() => dateInputRef.current?.showPicker()}
                    >
                        <div className="flex items-center justify-center gap-2 text-sm font-bold opacity-80 group-hover/date:opacity-100 group-hover/date:text-primary transition-colors">
                            <CalendarIcon size={16} />
                            <span className="select-none tracking-tight">{getDateRange().label}</span>
                        </div>
                        {/* Native Date Picker hidden trigger */}
                        <input 
                            ref={dateInputRef}
                            type="date" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            value={format(currentDate, 'yyyy-MM-dd')}
                            onChange={(e) => {
                                const date = new Date(e.target.value);
                                if (!isNaN(date.getTime())) {
                                    // Adjust for local timezone drift if needed, but standard date input usually works
                                    // Creating date from yyyy-mm-dd strings sets it to UTC midnight often, 
                                    // so adding time or handling timezone might be needed depending on browser.
                                    // Since we only care about the date part (and startOfDay/endOfDay handles it), new Date(value) is usually fine in local context.
                                    const ymd = e.target.value.split('-').map(Number);
                                    const localDate = new Date(ymd[0], ymd[1] - 1, ymd[2]);
                                    setCurrentDate(localDate);
                                }
                            }}
                        />
                    </div>

                    <button 
                        className="btn btn-ghost btn-circle btn-sm text-base-content/60 hover:bg-base-200 hover:text-primary" 
                        onClick={handleNext}
                        title="Next"
                    >
                        <ChevronRight size={20}/>
                    </button>
                </div>
            </div>

            <div className="grid gap-6">
                {combinedLogs.length === 0 ? (
                    <div className="text-center py-20 bg-base-200/50 rounded-2xl border-2 border-dashed border-base-300">
                        <FileText size={48} className="mx-auto mb-4 opacity-20" />
                        <h3 className="font-bold opacity-50">No activity logs found.</h3>
                        <p className="text-sm opacity-40">Check in to start tracking your work.</p>
                    </div>
                ) : (
                    combinedLogs.map(log => {
                        if (log.isMissed) {
                            return (
                                <div key={log.id} className="card bg-error/5 border-l-4 border-error shadow-sm hover:shadow-md transition-all">
                                    <div className="card-body p-6 flex flex-row items-center gap-4">
                                        <div className="p-3 bg-error/10 text-error rounded-full">
                                            <XCircle size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-error">Absent / No Check-in</h3>
                                            <p className="text-sm opacity-60">
                                                {formatDate(log.missedDate)} • Scheduled: {log.scheduleInfo}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={log.id} className="card bg-base-100 shadow-md hover:shadow-lg transition-all border border-base-200 relative overflow-hidden">
                                {log.isLate && (
                                    <div className="absolute top-0 right-0 bg-warning text-warning-content text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                                        <Clock size={10} /> Late Check-in
                                    </div>
                                )}
                                {log.leftEarly && !log.isLate && (
                                    <div className="absolute top-0 right-0 bg-warning/20 text-warning-content text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 border-l border-b border-warning/20">
                                        <LogOut size={10} /> Left Early
                                    </div>
                                )}
                                {log.forgotCheckout && (
                                    <div className="absolute top-0 right-0 bg-error text-error-content text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                                        <AlertTriangle size={10} /> Forgot Checkout
                                    </div>
                                )}

                                <div className="card-body p-6">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                        {/* Time Block */}
                                        <div className="flex items-start gap-4 min-w-50">
                                            <div className={`p-3 rounded-xl ${
                                                log.status === 'active' ? 'bg-success/10 text-success' : 
                                                (log.isLate || log.leftEarly || log.forgotCheckout) ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                                            }`}>
                                                <CalendarIcon size={24} />
                                            </div>
                                        <div>
                                            <h3 className="font-bold text-lg">{log.isMissed ? formatDate(log.missedDate) : formatDate(log.checkInTime)}</h3>
                                            <div className="flex items-center gap-2 text-sm opacity-70 mt-1 font-mono">
                                                    <Clock size={14} />
                                                    <span>{formatTime(log.checkInTime)}</span>
                                                    <span>-</span>
                                                    <span>{log.status === 'active' ? (
                                                        log.forgotCheckout ? <span className="text-error font-bold">Stalled?</span> : <span className="text-success font-bold animate-pulse">Active</span>
                                                    ) : formatTime(log.checkOutTime)}</span>
                                                </div>
                                                {log.scheduleInfo && (
                                                    <div className="text-[10px] opacity-40 mt-1">
                                                        Scheduled: {log.scheduleInfo}
                                                    </div>
                                                )}
                                                {log.durationMinutes ? (
                                                    <div className="flex flex-col gap-1 items-start mt-2">
                                                        <div className="badge badge-ghost font-mono text-xs">
                                                            {Math.floor(log.durationMinutes / 60)}h {log.durationMinutes % 60}m worked
                                                        </div>
                                                        {log.breakDurationMinutes && log.breakDurationMinutes > 0 ? (
                                                            <div className="badge badge-warning badge-outline font-mono text-xs gap-1 opacity-70">
                                                                <Coffee size={8} />
                                                                {Math.floor(log.breakDurationMinutes / 60)}h {log.breakDurationMinutes % 60}m break
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Report Content */}
                                        <div className="flex-1 bg-base-200/30 p-4 rounded-xl border border-base-200/50">
                                            <h4 className="font-bold text-xs uppercase tracking-widest opacity-50 mb-2 flex items-center gap-2">
                                                <CheckCircle size={12} /> Work Summary
                                            </h4>
                                            
                                            {/* Flag Messages inside content */}
                                            {(log.isLate || log.leftEarly || log.forgotCheckout) && (
                                                <div className="mb-3 flex flex-wrap gap-2">
                                                    {log.isLate && <span className="badge badge-warning text-xs gap-1"><AlertCircle size={10}/> Late Arrival</span>}
                                                    {log.leftEarly && <span className="badge badge-warning badge-outline text-xs gap-1"><LogOut size={10}/> Left Early</span>}
                                                    {log.forgotCheckout && <span className="badge badge-error text-xs gap-1"><AlertTriangle size={10}/> Forgot Checkout</span>}
                                                </div>
                                            )}

                                            {log.report ? (
                                                <p className="whitespace-pre-wrap text-sm leading-relaxed">{log.report}</p>
                                            ) : (
                                                <p className="italic opacity-40 text-sm">
                                                    {log.status === 'active' ? 'Session in progress...' : 
                                                     log.forgotCheckout ? 'No report submitted (Active limit exceeded).' : 'No report submitted.'}
                                                </p>
                                            )}

                                            {/* Attachments (Links) */}
                                            {log.attachments && log.attachments.length > 0 && (
                                                <div className="mt-4 pt-3 border-t border-base-content/5">
                                                    <h5 className="font-bold text-[10px] uppercase tracking-widest opacity-50 mb-2 flex items-center gap-2">
                                                        <LinkIcon size={10} /> Proof of Work
                                                    </h5>
                                                    <div className="flex flex-col gap-1">
                                                        {log.attachments.map((link, idx) => (
                                                            <a 
                                                                key={idx} 
                                                                href={link} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-2 text-xs text-primary hover:underline bg-base-100 px-3 py-2 rounded-lg border border-base-200 hover:border-primary/30 transition-colors w-fit max-w-full"
                                                            >
                                                                <ExternalLink size={12} />
                                                                <span className="truncate">{link}</span>
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
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

        {/* Team Sidebar - Admin/Manager only */}
        {isAdminOrManager && (
            <>
            {/* Collapsed toggle */}
            {!sidebarOpen && (
                <button 
                    onClick={() => setSidebarOpen(true)}
                    className="shrink-0 flex flex-col items-center gap-2 bg-base-100 border border-base-200 rounded-xl p-2 shadow-sm hover:shadow-md transition-shadow self-start"
                    title="Show team"
                >
                    <Users className="w-5 h-5 text-primary" />
                    <ChevronRight className="w-4 h-4 text-base-content/40 rotate-180" />
                </button>
            )}

            {/* Expanded sidebar */}
            {sidebarOpen && (
                <aside className="w-56 shrink-0 bg-base-100 border border-base-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                    {/* Sidebar Header */}
                    <div className="p-3 border-b border-base-200 flex items-center justify-between">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            Team
                        </h3>
                        <button 
                            onClick={() => setSidebarOpen(false)}
                            className="btn btn-ghost btn-xs btn-circle"
                            title="Collapse"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* My Logs Button */}
                    <div className="p-2 border-b border-base-200">
                        <button
                            onClick={() => setViewingUserId(user?.uid || '')}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                                !viewingUser
                                    ? 'bg-primary/10 text-primary font-medium' 
                                    : 'hover:bg-base-200 text-base-content'
                            }`}
                        >
                            <UserAvatar 
                                photoURL={profile?.photoURL} 
                                displayName={profile?.displayName}
                                size="xs"
                                showRing={false}
                            />
                            <span className="truncate">My Logs</span>
                        </button>
                    </div>

                    {/* Team Members List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {usersLoading ? (
                            <div className="flex justify-center py-4">
                                <span className="loading loading-spinner loading-sm text-primary"></span>
                            </div>
                        ) : teamMembers.length === 0 ? (
                            <p className="text-xs text-base-content/40 text-center py-4">No team members</p>
                        ) : (
                            teamMembers.map(member => (
                                <button
                                    key={member.uid}
                                    onClick={() => setViewingUserId(member.uid)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                                        viewingUserId === member.uid 
                                            ? 'bg-primary/10 text-primary font-medium' 
                                            : 'hover:bg-base-200 text-base-content'
                                    }`}
                                    title={member.displayName || member.email || ''}
                                >
                                    <UserAvatar 
                                        photoURL={member.photoURL} 
                                        displayName={member.displayName}
                                        size="xs"
                                        showRing={false}
                                    />
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className="truncate text-sm">{member.displayName || 'Unknown'}</p>
                                        <p className="truncate text-[10px] text-base-content/40">{member.role}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </aside>
            )}
            </>
        )}
        </div>
    );
}
