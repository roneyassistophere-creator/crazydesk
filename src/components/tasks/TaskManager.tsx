'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, where, orderBy, serverTimestamp, getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/context/AuthContext';
import {
  Plus, Trash2, CheckSquare, LayoutList, Search, X,
  ChevronDown, ChevronRight, ChevronLeft, Calendar, Flag,
  ExternalLink, LinkIcon, FileText, Table2, Camera,
  HardDrive, Globe, Type, Hash, ListFilter, CheckCircle,
  Sun, Sunrise, CalendarRange, CalendarDays, Repeat, Undo2,
  ArrowUp, ArrowDown, AlertCircle, Clock, Inbox, Send, User,
} from 'lucide-react';
import RequestTaskModal from './RequestTaskModal';
import TaskRequestsSection from './TaskRequestsSection';

type SectionKey = 'simple' | 'recurring' | 'list';

// ─── Types ──────────────────────────────────────────────────
interface ColumnOption {
  label: string;
  color: string;
}

interface CustomColumn {
  id: string;
  name: string;
  type: string;
  options?: ColumnOption[];
}

interface LinkValue {
  url: string;
  name: string;
}

interface TaskDoc {
  id: string;
  title: string;
  type: 'simple' | 'list' | 'recurring';
  status: string;
  priority: string;
  deadline: string;
  recurrence?: 'daily' | 'weekly' | 'monthly';
  recurringTime?: string;
  recurringDays?: string[];
  recurringDate?: number;
  lastCompletedAt?: string;
  lastAutoAdvanced?: string;
  isOverdueInstance?: boolean;
  recurringParentId?: string;
  requestedByUserId?: string;
  requestedByUserName?: string;
  deletionPending?: boolean;
  deletionRequestedBy?: string;
  deletionRequestedByName?: string;
  deletionRequestedAt?: string;
  createdAt: Timestamp | null;
  createdBy: string;
  createdByName?: string;
  links?: { title: string; url: string; id: number }[];
  customColumns?: CustomColumn[];
  [key: string]: unknown;
}

interface SubItem {
  id: string;
  title: string;
  status: string;
  deadline: string;
}

interface SubTaskDoc {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string;
  customFields?: Record<string, unknown>;
  subItems?: SubItem[];
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────
const OPTION_COLORS = [
  { value: 'default', label: 'Default', badge: 'badge-ghost', bg: 'bg-base-200' },
  { value: 'red', label: 'Red', badge: 'badge-error', bg: 'bg-error/10' },
  { value: 'orange', label: 'Orange', badge: 'badge-warning', bg: 'bg-warning/10' },
  { value: 'green', label: 'Green', badge: 'badge-success', bg: 'bg-success/10' },
  { value: 'blue', label: 'Blue', badge: 'badge-info', bg: 'bg-info/10' },
  { value: 'purple', label: 'Purple', badge: 'badge-secondary', bg: 'bg-secondary/10' },
  { value: 'primary', label: 'Primary', badge: 'badge-primary', bg: 'bg-primary/10' },
];

const COLUMN_TYPES = [
  { value: 'text', label: 'Text', icon: Type },
  { value: 'number', label: 'Number', icon: Hash },
  { value: 'dropdown', label: 'Dropdown', icon: ListFilter },
  { value: 'checkbox', label: 'Checkbox', icon: CheckCircle },
  { value: 'doc_link', label: 'Doc Link', icon: FileText },
  { value: 'sheet_link', label: 'Sheet Link', icon: Table2 },
  { value: 'snap_link', label: 'Snap Link', icon: Camera },
  { value: 'drive_link', label: 'Drive Link', icon: HardDrive },
  { value: 'website_link', label: 'Website Link', icon: Globe },
];

// ─── Overdue Helper ─────────────────────────────────────────
const isTaskOverdue = (task: { deadline?: string; status: string }) => {
  if (!task.deadline || task.status === 'done') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(task.deadline);
  deadline.setHours(0, 0, 0, 0);
  return deadline < today;
};

const getNextRecurringDeadline = (recurrence: string, baseDate: Date, recurringDays?: string[], recurringDate?: number): string => {
  const d = new Date(baseDate);
  switch (recurrence) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly': {
      if (recurringDays && recurringDays.length > 0) {
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const targets = recurringDays.map(day => dayMap[day]).filter(x => x !== undefined).sort((a, b) => a - b);
        const current = d.getDay();
        let found = false;
        for (const t of targets) {
          if (t > current) { d.setDate(d.getDate() + (t - current)); found = true; break; }
        }
        if (!found) { d.setDate(d.getDate() + (7 - current + targets[0])); }
      } else {
        d.setDate(d.getDate() + 7);
      }
      break;
    }
    case 'monthly': {
      const target = recurringDate || d.getDate();
      d.setMonth(d.getMonth() + 1);
      const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(target, max));
      break;
    }
    default:
      d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
};

// ─── Confirm Modal ──────────────────────────────────────────
const ConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmClass?: string;
}> = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmClass = 'btn-error' }) => {
  if (!isOpen) return null;
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="py-4 text-sm text-base-content/70">{message}</p>
        <div className="modal-action">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn btn-sm ${confirmClass}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
};

// ─── Add Column Modal ───────────────────────────────────────
const AddColumnModal: React.FC<{
  isOpen: boolean;
  listId: string | null;
  onClose: () => void;
  onAdd: (listId: string, column: Omit<CustomColumn, 'id'>) => Promise<void>;
}> = ({ isOpen, listId, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [options, setOptions] = useState<ColumnOption[]>([]);
  const [newOption, setNewOption] = useState('');
  const [newOptionColor, setNewOptionColor] = useState('default');

  const handleSubmit = async () => {
    if (!listId) return;
    const col: Omit<CustomColumn, 'id'> = {
      name: name || COLUMN_TYPES.find(t => t.value === type)?.label || type,
      type,
      ...(type === 'dropdown' ? { options } : {}),
    };
    await onAdd(listId, col);
    setName('');
    setType('text');
    setOptions([]);
    onClose();
  };

  const addOption = () => {
    if (newOption.trim()) {
      setOptions([...options, { label: newOption.trim(), color: newOptionColor }]);
      setNewOption('');
      setNewOptionColor('default');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md">
        <h3 className="font-bold text-lg mb-4">Add Custom Column</h3>

        <div className="form-control mb-3">
          <label className="label"><span className="label-text text-sm">Column Type</span></label>
          <div className="grid grid-cols-3 gap-2">
            {COLUMN_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`btn btn-sm gap-2 ${type === t.value ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-control mb-3">
          <label className="label"><span className="label-text text-sm">Column Name</span></label>
          <input
            type="text"
            className="input input-sm input-bordered"
            placeholder={COLUMN_TYPES.find(t => t.value === type)?.label || 'Column name'}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        {type === 'dropdown' && (
          <div className="form-control mb-3">
            <label className="label"><span className="label-text text-sm">Options</span></label>
            <div className="space-y-2 mb-2">
              {options.map((opt, i) => {
                const col = OPTION_COLORS.find(c => c.value === opt.color);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`badge badge-sm ${col?.badge || 'badge-ghost'}`}>{opt.label}</span>
                    <button onClick={() => setOptions(options.filter((_, idx) => idx !== i))} className="btn btn-ghost btn-xs text-error">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="input input-xs input-bordered flex-1"
                placeholder="Option name"
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOption()}
              />
              <select
                className="select select-xs select-bordered"
                value={newOptionColor}
                onChange={e => setNewOptionColor(e.target.value)}
              >
                {OPTION_COLORS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button onClick={addOption} className="btn btn-xs btn-primary"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
        )}

        <div className="modal-action">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={handleSubmit}>Add Column</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
};

// ─── Custom Field Cell ──────────────────────────────────────
const CustomFieldCell: React.FC<{
  column: CustomColumn;
  value: unknown;
  onSave: (val: unknown) => void;
}> = ({ column, value, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTempValue(value); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsEditing(false);
      }
    };
    if (isEditing) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing]);

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      let top = rect.bottom + 4;
      if (spaceBelow < 200) top = rect.top - 200;
      setPosition({ top: Math.max(8, top), left: rect.left });
    }
    setIsEditing(true);
  };

  const handleSelect = (val: unknown) => {
    onSave(val);
    setIsEditing(false);
  };

  // Number
  if (column.type === 'number') {
    return (
      <>
        <div ref={buttonRef} onClick={handleOpen} className="cursor-pointer px-2 py-1 rounded hover:bg-base-200 text-xs tabular-nums">
          {value != null ? String(value) : '-'}
        </div>
        {isEditing && (
          <div ref={dropdownRef} className="fixed z-[9999] bg-base-100 rounded-lg shadow-xl border border-base-200 p-2" style={position}>
            <input type="number" className="input input-xs input-bordered w-24" value={tempValue != null ? String(tempValue) : ''} onChange={e => setTempValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onSave(Number(tempValue)); setIsEditing(false); } }} autoFocus />
          </div>
        )}
      </>
    );
  }

  // Checkbox
  if (column.type === 'checkbox') {
    return (
      <div className="flex items-center justify-center">
        <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={!!value} onChange={e => onSave(e.target.checked)} />
      </div>
    );
  }

  // Text
  if (column.type === 'text') {
    return (
      <>
        <div ref={buttonRef} onClick={handleOpen} className="cursor-pointer px-2 py-1 rounded hover:bg-base-200 text-xs truncate max-w-[100px]">
          {(value as string) || '-'}
        </div>
        {isEditing && (
          <div ref={dropdownRef} className="fixed z-[9999] bg-base-100 rounded-lg shadow-xl border border-base-200 p-2" style={position}>
            <input type="text" className="input input-xs input-bordered w-32" value={(tempValue as string) || ''} onChange={e => setTempValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onSave(tempValue); setIsEditing(false); } }} autoFocus />
          </div>
        )}
      </>
    );
  }

  // Dropdown
  if (column.type === 'dropdown') {
    const selectedOption = column.options?.find(opt => opt.label === value);
    const selectedColor = OPTION_COLORS.find(c => c.value === selectedOption?.color);
    return (
      <>
        <div ref={buttonRef} onClick={handleOpen} className={`badge badge-sm cursor-pointer ${selectedColor?.badge || 'badge-ghost'}`}>
          {(value as string) || 'Select...'}
        </div>
        {isEditing && (
          <div ref={dropdownRef} className="fixed z-[9999] menu p-1 shadow-xl bg-base-100 rounded-lg w-32 border border-base-200" style={position}>
            {column.options?.map(opt => {
              const optColor = OPTION_COLORS.find(c => c.value === opt.color);
              return (
                <button key={opt.label} onClick={() => handleSelect(opt.label)} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-xs w-full text-left">
                  <span className={`badge badge-xs ${optColor?.badge || 'badge-ghost'}`}></span>
                  {opt.label}
                </button>
              );
            })}
            {!!value && (
              <button onClick={() => handleSelect('')} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-xs w-full text-left text-error mt-1 border-t border-base-200">Clear</button>
            )}
          </div>
        )}
      </>
    );
  }

  // Link types
  const linkTypes = ['doc_link', 'sheet_link', 'snap_link', 'drive_link', 'website_link'];
  if (linkTypes.includes(column.type)) {
    return <LinkFieldCell column={column} value={value} onSave={onSave} />;
  }

  return <span className="text-xs text-base-content/30">-</span>;
};

// ─── Link Field Cell (extracted to avoid hooks-in-conditionals) ──
const LinkFieldCell: React.FC<{
  column: CustomColumn;
  value: unknown;
  onSave: (val: unknown) => void;
}> = ({ column, value, onSave }) => {
  const iconMap: Record<string, React.FC<{ className?: string }>> = {
    doc_link: FileText, sheet_link: Table2, snap_link: Camera,
    drive_link: HardDrive, website_link: Globe,
  };
  const Icon = iconMap[column.type] || Globe;

  const linkData = (typeof value === 'object' && value !== null) ? (value as LinkValue) : { url: (value as string) || '', name: '' };
  const [linkName, setLinkName] = useState(linkData.name || '');
  const [linkUrl, setLinkUrl] = useState(linkData.url || '');
  const [urlError, setUrlError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const data = (typeof value === 'object' && value !== null) ? (value as LinkValue) : { url: (value as string) || '', name: '' };
    setLinkName(data.name || '');
    setLinkUrl(data.url || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsEditing(false);
      }
    };
    if (isEditing) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing]);

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setIsEditing(true);
  };

  const isValidUrl = (str: string) => { try { new URL(str); return true; } catch { return false; } };

  const handleSaveLink = () => {
    if (!linkUrl.trim()) { onSave(null); setIsEditing(false); setUrlError(''); return; }
    if (!isValidUrl(linkUrl.trim())) { setUrlError('Please enter a valid URL (e.g., https://example.com)'); return; }
    onSave({ url: linkUrl.trim(), name: linkName.trim() || new URL(linkUrl.trim()).hostname });
    setIsEditing(false);
    setUrlError('');
  };

  return (
    <>
      <div ref={buttonRef} onClick={handleOpen} className="cursor-pointer flex items-center gap-1 text-xs">
        {linkData.url ? (
          <a href={linkData.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline" onClick={e => e.stopPropagation()}>
            <Icon className="w-3 h-3" />
            <span className="truncate max-w-[100px]">{linkData.name || 'Link'}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="flex items-center gap-1 text-base-content/40">
            <Icon className="w-3 h-3" /><span>Add link</span>
          </span>
        )}
      </div>
      {isEditing && (
        <div ref={dropdownRef} className="fixed z-[9999] bg-base-100 rounded-xl shadow-xl border border-base-200 p-3 min-w-[250px]" style={position}>
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <span>{COLUMN_TYPES.find(t => t.value === column.type)?.label}</span>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-base-content/60 mb-1 block">Link Name</label>
              <input type="text" className="input input-sm input-bordered w-full" placeholder="e.g., Project Doc..." value={linkName} onChange={e => setLinkName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-base-content/60 mb-1 block">URL *</label>
              <input type="url" className={`input input-sm input-bordered w-full ${urlError ? 'input-error' : ''}`} placeholder="https://..." value={linkUrl} onChange={e => { setLinkUrl(e.target.value); setUrlError(''); }} onKeyDown={e => { if (e.key === 'Enter') handleSaveLink(); }} autoFocus />
              {urlError && <p className="text-xs text-error mt-1">{urlError}</p>}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSaveLink} className="btn btn-sm btn-primary flex-1">Save</button>
            {linkData.url && <button onClick={() => { onSave(null); setIsEditing(false); setUrlError(''); }} className="btn btn-sm btn-ghost text-error">Clear</button>}
          </div>
        </div>
      )}
    </>
  );
};

// ─── Column Header ──────────────────────────────────────────
const ColumnHeader: React.FC<{
  column: CustomColumn;
  onSave: (newName: string) => void;
  onDelete: () => void;
}> = ({ column, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTempName(column.name); }, [column.name]);
  useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [isEditing]);

  const handleSave = () => {
    const finalName = tempName.trim() || COLUMN_TYPES.find(t => t.value === column.type)?.label || column.type;
    if (finalName !== column.name) onSave(finalName);
    setIsEditing(false);
  };

  const typeConfig = COLUMN_TYPES.find(t => t.value === column.type);
  const Icon = typeConfig?.icon || Type;

  if (isEditing) {
    return (
      <input ref={inputRef} type="text" className="input input-xs input-bordered w-20 text-xs" value={tempName} onChange={e => setTempName(e.target.value)} onBlur={handleSave} onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setTempName(column.name); setIsEditing(false); } }} />
    );
  }

  return (
    <div className="flex items-center gap-1 group/header">
      <Icon className="w-3 h-3 text-base-content/40" />
      <span className="truncate cursor-pointer hover:text-primary" onClick={() => setIsEditing(true)} title="Click to rename">{column.name}</span>
      <button onClick={onDelete} className="btn btn-ghost btn-xs text-error opacity-0 group-hover/header:opacity-100 p-0 h-4 min-h-0">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ─── Date Picker Popover ────────────────────────────────────
const DatePickerPopover: React.FC<{
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onSave, placeholder = 'Set date', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const quickOptions = [
    { label: 'Tomorrow', icon: Sunrise, date: new Date(today.getTime() + 86400000), color: 'text-info' },
    { label: 'Next Day', icon: Sun, date: new Date(today.getTime() + 2 * 86400000), color: 'text-warning' },
    { label: 'Weekend', icon: CalendarRange, date: (() => { const d = new Date(today); const du = (4 - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + du); return d; })(), color: 'text-accent' },
    { label: 'Next Week', icon: CalendarDays, date: new Date(today.getTime() + 7 * 86400000), color: 'text-secondary' },
  ];

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = window.innerWidth - rect.left;
      let top = rect.bottom + 4;
      let left = rect.left;
      if (spaceBelow < 350) top = rect.top - 350;
      if (spaceRight < 290) left = rect.right - 288;
      setPosition({ top: Math.max(8, top), left: Math.max(8, left) });
    }
    setIsOpen(true);
  };

  const handleDateSelect = (day: number) => {
    const selected = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    onSave(formatDate(selected));
    setIsOpen(false);
  };

  const getDaysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const isToday = (day: number) => {
    const check = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return check.toDateString() === today.toDateString();
  };
  const isSelected = (day: number) => {
    if (!value) return false;
    const check = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return formatDate(check) === value;
  };
  const isPast = (day: number) => {
    const check = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return check < today;
  };

  const getDisplayValue = () => {
    if (!value) return null;
    const date = new Date(value);
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return { text: 'Today', color: 'text-success' };
    if (diffDays === 1) return { text: 'Tomorrow', color: 'text-info' };
    if (diffDays === 7) return { text: 'Next Week', color: 'text-warning' };
    if (diffDays < 0) return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'text-error' };
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'text-base-content' };
  };

  const displayValue = getDisplayValue();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <>
      <button ref={buttonRef} onClick={handleOpen} className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-base-200 transition-colors text-sm ${className} ${displayValue ? displayValue.color : 'text-base-content/40'}`}>
        <Calendar className="w-3 h-3" />
        <span>{displayValue ? displayValue.text : placeholder}</span>
      </button>

      {isOpen && (
        <div ref={popoverRef} className="fixed z-[9999] bg-base-100 rounded-xl shadow-2xl border border-base-200 p-3 w-72" style={position}>
          {/* Quick Options */}
          <div className="grid grid-cols-2 gap-1 mb-3">
            {quickOptions.map(opt => (
              <button key={opt.label} onClick={() => { onSave(formatDate(opt.date)); setIsOpen(false); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-base-200 transition-colors text-sm ${opt.color}`}>
                <opt.icon className="w-4 h-4" />{opt.label}
              </button>
            ))}
          </div>
          <div className="divider my-2 text-xs opacity-50">or pick a date</div>
          {/* Month Nav */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="btn btn-ghost btn-xs btn-circle"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-semibold text-sm">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
            <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="btn btn-ghost btn-xs btn-circle"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="font-medium text-base-content/50 py-1">{d}</div>)}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              return (
                <button key={day} onClick={() => handleDateSelect(day)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isSelected(day) ? 'bg-primary text-primary-content font-bold' : ''} ${isToday(day) && !isSelected(day) ? 'ring-2 ring-primary ring-offset-1' : ''} ${isPast(day) && !isToday(day) ? 'text-base-content/30' : ''} ${!isSelected(day) ? 'hover:bg-base-200' : ''}`}>
                  {day}
                </button>
              );
            })}
          </div>
          {value && <button onClick={() => { onSave(''); setIsOpen(false); }} className="btn btn-ghost btn-xs w-full mt-2 text-error"><X className="w-3 h-3" /> Clear Date</button>}
        </div>
      )}
    </>
  );
};

// ─── Editable Cell ──────────────────────────────────────────
const EditableCell: React.FC<{
  value: string;
  onSave: (val: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}> = ({ value, onSave, type = 'text', placeholder = 'Click to edit...', className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [isEditing]);
  useEffect(() => { setTempValue(value); }, [value]);

  const handleSave = () => { onSave(tempValue); setIsEditing(false); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setTempValue(value); setIsEditing(false); }
  };

  if (isEditing) {
    return <input ref={inputRef} type="text" value={tempValue || ''} onChange={e => setTempValue(e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} className={`input input-xs input-bordered w-full ${className}`} placeholder={placeholder} />;
  }

  return (
    <div onClick={() => setIsEditing(true)} className={`cursor-pointer hover:bg-base-200 px-2 py-1 rounded min-h-[28px] flex items-center ${className} ${!value ? 'text-base-content/30 italic' : ''}`}>
      {type === 'date' && value ? new Date(value).toLocaleDateString() : (value || placeholder)}
    </div>
  );
};

// ─── Priority Dropdown ──────────────────────────────────────
const PriorityDropdown: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const priorities = [
    { value: 'urgent', label: 'Urgent', color: 'text-error bg-error/10' },
    { value: 'high', label: 'High', color: 'text-warning bg-warning/10' },
    { value: 'normal', label: 'Normal', color: 'text-info bg-info/10' },
    { value: 'low', label: 'Low', color: 'text-success bg-success/10' },
  ];
  const current = priorities.find(p => p.value === value) || priorities[2];

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <>
      <div ref={buttonRef} onClick={handleOpen} className={`badge badge-sm gap-1 cursor-pointer ${current.color}`}>
        <Flag className="w-3 h-3" />{current.label}
      </div>
      {isOpen && (
        <div ref={dropdownRef} className="fixed z-[9999] menu p-1 shadow-xl bg-base-100 rounded-lg w-32 border border-base-200" style={position}>
          {priorities.map(p => (
            <button key={p.value} onClick={() => { onChange(p.value); setIsOpen(false); }} className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-xs w-full text-left ${p.color}`}>
              <Flag className="w-3 h-3" /> {p.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

// ─── Status Dropdown ────────────────────────────────────────
const StatusDropdown: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const statuses = [
    { value: 'todo', label: 'To Do', color: 'badge-ghost' },
    { value: 'in_progress', label: 'In Progress', color: 'badge-warning' },
    { value: 'review', label: 'Review', color: 'badge-info' },
    { value: 'done', label: 'Done', color: 'badge-success' },
  ];
  const current = statuses.find(s => s.value === value) || statuses[0];

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      let left = rect.left;
      if (left + 120 > vw) left = vw - 130;
      setPosition({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <>
      <div ref={buttonRef} onClick={handleOpen} className={`badge badge-sm cursor-pointer whitespace-nowrap ${current.color}`}>
        {current.label}
      </div>
      {isOpen && (
        <div ref={dropdownRef} className="fixed z-[9999] menu p-1 shadow-xl bg-base-100 rounded-lg w-28 sm:w-32 border border-base-200" style={position}>
          {statuses.map(s => (
            <button key={s.value} onClick={() => { onChange(s.value); setIsOpen(false); }} className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded hover:bg-base-200 text-xs w-full text-left whitespace-nowrap">
              <span className={`badge badge-xs ${s.color}`}></span>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
};

// ─── Links Popover ──────────────────────────────────────────
const LinksPopover: React.FC<{
  links: { title: string; url: string; id: number }[];
  onUpdate: (taskId: string, data: Partial<TaskDoc>) => Promise<void>;
  taskId: string;
}> = ({ links = [], onUpdate, taskId }) => {
  const [newLink, setNewLink] = useState({ title: '', url: '' });

  const addLink = async () => {
    if (newLink.url) {
      const updatedLinks = [...links, { ...newLink, id: Date.now() }];
      await onUpdate(taskId, { links: updatedLinks });
      setNewLink({ title: '', url: '' });
    }
  };

  const removeLink = async (index: number) => {
    const updatedLinks = links.filter((_, i) => i !== index);
    await onUpdate(taskId, { links: updatedLinks });
  };

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-xs gap-1">
        <LinkIcon className="w-3 h-3" />
        {links.length > 0 && <span className="badge badge-xs badge-primary">{links.length}</span>}
      </div>
      <div tabIndex={0} className="dropdown-content z-[10] p-3 shadow-lg bg-base-100 rounded-lg w-72 border border-base-200">
        <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Links</h4>
        {links.length > 0 && (
          <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
            {links.map((link, index) => (
              <div key={index} className="flex items-center gap-2 text-xs bg-base-200/50 p-1.5 rounded group">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline text-primary">{link.title || link.url}</a>
                <button onClick={() => removeLink(index)} className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <input type="text" placeholder="Title" value={newLink.title} onChange={e => setNewLink({ ...newLink, title: e.target.value })} className="input input-xs input-bordered flex-1" />
          <input type="url" placeholder="URL" value={newLink.url} onChange={e => setNewLink({ ...newLink, url: e.target.value })} className="input input-xs input-bordered flex-1" />
          <button onClick={addLink} className="btn btn-xs btn-primary"><Plus className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
};

// ─── Recurrence Dropdown ────────────────────────────────────
const RecurrenceDropdown: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const options = [
    { value: 'daily', label: 'Daily', icon: Sun },
    { value: 'weekly', label: 'Weekly', icon: CalendarRange },
    { value: 'monthly', label: 'Monthly', icon: CalendarDays },
  ];
  const current = options.find(o => o.value === value) || options[0];

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <>
      <div ref={buttonRef} onClick={handleOpen} className="badge badge-sm badge-accent badge-outline gap-1 cursor-pointer">
        <current.icon className="w-3 h-3" />{current.label}
      </div>
      {isOpen && (
        <div ref={dropdownRef} className="fixed z-[9999] menu p-1 shadow-xl bg-base-100 rounded-lg w-32 border border-base-200" style={position}>
          {options.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setIsOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-xs w-full text-left">
              <o.icon className="w-3 h-3" /> {o.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════
// ─── MAIN TASK MANAGER COMPONENT ────────────────────────────
// ═════════════════════════════════════════════════════════════
interface TaskManagerProps {
  targetUserId?: string;
  targetUserName?: string;
}

export default function TaskManager({ targetUserId, targetUserName }: TaskManagerProps) {
  const { user, profile } = useAuth();

  // State
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [subTasks, setSubTasks] = useState<Record<string, SubTaskDoc[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, confirmLabel: 'Confirm', confirmClass: 'btn-error' });
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnModalListId, setColumnModalListId] = useState<string | null>(null);
  const [simpleTab, setSimpleTab] = useState<'active' | 'completed'>('active');
  const [recurringTab, setRecurringTab] = useState<'active' | 'completed'>('active');
  const [listTab, setListTab] = useState<'active' | 'completed'>('active');
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(['simple', 'recurring', 'list']);
  const [addTaskPopupOpen, setAddTaskPopupOpen] = useState(false);
  const [expandedListItems, setExpandedListItems] = useState<Set<string>>(new Set());
  const addTaskPopupRef = useRef<HTMLDivElement>(null);
  const overdueProcessedRef = useRef(new Set<string>());
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestsSectionOpen, setRequestsSectionOpen] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // ─── Listen for pending incoming task requests count ───
  // Single-field query to avoid composite index requirement; filter client-side
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'task_requests'),
      where('toUserId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const pendingCount = snap.docs.filter(d => d.data().status === 'pending').length;
      setPendingRequestCount(pendingCount);
    });
    return () => unsub();
  }, [user]);

  // Permissions — role-based
  const isManagerOrAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';
  const canAddTasks = !!user;

  // Per-task permission checks
  const canEditTask = (task: TaskDoc) => {
    if (!user) return false;
    if (isManagerOrAdmin) return true;
    // Team members can only edit tasks they created
    return task.createdBy === user.uid;
  };

  const canDeleteTask = (task: TaskDoc) => {
    if (!user) return false;
    if (isManagerOrAdmin) return true;
    // Team members can only delete tasks they created
    return task.createdBy === user.uid;
  };

  const canChangeTaskStatus = (task: TaskDoc) => {
    if (!user) return false;
    // Everyone can change status (check a box, move to done, etc.)
    return true;
  };

  // ─── Firestore: Listen for tasks ────────────────────────
  // Admins/Managers see ALL tasks; Team Members/Clients see only their own
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const tasksCol = collection(db, 'tasks');
    const effectiveUserId = targetUserId || user.uid;
    const q = query(tasksCol, where('createdBy', '==', effectiveUserId), orderBy('createdAt', 'desc'));

    const subUnsubs: (() => void)[] = [];

    const unsub = onSnapshot(q, (snapshot) => {
      const items: TaskDoc[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as TaskDoc[];
      setTasks(items);
      setLoading(false);

      // Clean up previous subtask listeners
      subUnsubs.forEach(u => u());
      subUnsubs.length = 0;

      // Subscribe to subtasks for each list and simple task
      items.filter(t => t.type === 'list' || t.type === 'simple' || t.type === 'recurring').forEach(task => {
        const subQ = query(
          collection(db, 'tasks', task.id, 'subtasks'),
          orderBy('createdAt', 'asc'),
        );
        const subUnsub = onSnapshot(subQ, (subSnap) => {
          const subs: SubTaskDoc[] = subSnap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as SubTaskDoc[];
          setSubTasks(prev => ({ ...prev, [task.id]: subs }));
        });
        subUnsubs.push(subUnsub);
      });
    }, (error) => {
      console.error('Tasks listener error:', error);
      setLoading(false);
    });

    return () => {
      unsub();
      subUnsubs.forEach(u => u());
    };
  }, [user, targetUserId]);

  // ─── Auto-advance overdue recurring tasks ───────────────
  useEffect(() => {
    if (!user || loading || tasks.length === 0) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    tasks.filter(t => t.type === 'recurring' && t.status !== 'done' && t.deadline).forEach(async (task) => {
      const deadline = new Date(task.deadline);
      deadline.setHours(0, 0, 0, 0);
      if (deadline >= today) return;

      // Guard: already processed in this session
      const key = `${task.id}_${task.deadline}`;
      if (overdueProcessedRef.current.has(key)) return;
      overdueProcessedRef.current.add(key);

      // Guard: already auto-advanced today
      if (task.lastAutoAdvanced === todayStr) return;

      // Calculate next future deadline
      let nextDate = new Date(deadline);
      let iterations = 0;
      while (nextDate < today && iterations < 365) {
        const nextStr = getNextRecurringDeadline(task.recurrence || 'daily', nextDate, task.recurringDays, task.recurringDate);
        nextDate = new Date(nextStr);
        iterations++;
      }

      try {
        // Create overdue simple task for the missed period
        await addDoc(collection(db, 'tasks'), {
          title: task.title || 'Untitled Task',
          type: 'simple',
          status: 'todo',
          priority: 'urgent',
          deadline: task.deadline,
          createdAt: serverTimestamp(),
          createdBy: task.createdBy,
          createdByName: task.createdByName || '',
          isOverdueInstance: true,
          recurringParentId: task.id,
        });

        // Advance the recurring task
        await updateDoc(doc(db, 'tasks', task.id), {
          deadline: nextDate.toISOString().split('T')[0],
          status: 'todo',
          lastAutoAdvanced: todayStr,
        });
      } catch (e) {
        console.error('Auto-advance recurring task error:', e);
      }
    });
  }, [tasks, user, loading]);

  const allSimple = tasks.filter(t => t.type === 'simple');
  const allList = tasks.filter(t => t.type === 'list');
  const allRecurring = tasks.filter(t => t.type === 'recurring');

  const simpleTasks = allSimple.filter(t => simpleTab === 'completed' ? t.status === 'done' : t.status !== 'done');
  const listTasks = allList.filter(t => listTab === 'completed' ? t.status === 'done' : t.status !== 'done');
  const recurringTasks = allRecurring.filter(t => recurringTab === 'completed' ? t.status === 'done' : t.status !== 'done');

  const simpleCompletedCount = allSimple.filter(t => t.status === 'done').length;
  const simpleActiveCount = allSimple.filter(t => t.status !== 'done').length;
  const recurringCompletedCount = allRecurring.filter(t => t.status === 'done').length;
  const recurringActiveCount = allRecurring.filter(t => t.status !== 'done').length;
  const listCompletedCount = allList.filter(t => t.status === 'done').length;
  const listActiveCount = allList.filter(t => t.status !== 'done').length;

  // ─── CRUD ─────────────────────────────────────────────────
  const createSimpleTask = async () => {
    const effectiveUserId = targetUserId || user!.uid;
    const effectiveUserName = targetUserName || user!.displayName || user!.email || 'Unknown';
    await addDoc(collection(db, 'tasks'), {
      title: '',
      type: 'simple',
      status: 'todo',
      priority: 'normal',
      deadline: '',
      createdAt: serverTimestamp(),
      createdBy: effectiveUserId,
      createdByName: effectiveUserName,
    });
  };

  const createListTask = async () => {
    const effectiveUserId = targetUserId || user!.uid;
    const effectiveUserName = targetUserName || user!.displayName || user!.email || 'Unknown';
    const ref = await addDoc(collection(db, 'tasks'), {
      title: '',
      type: 'list',
      status: 'todo',
      priority: 'normal',
      deadline: '',
      customColumns: [],
      createdAt: serverTimestamp(),
      createdBy: effectiveUserId,
      createdByName: effectiveUserName,
    });
    setExpandedLists(prev => new Set(prev).add(ref.id));
  };

  const createRecurringTask = async (recurrence: 'daily' | 'weekly' | 'monthly') => {
    const effectiveUserId = targetUserId || user!.uid;
    const effectiveUserName = targetUserName || user!.displayName || user!.email || 'Unknown';
    // Set initial deadline based on recurrence
    const now = new Date();
    let deadline = '';
    switch (recurrence) {
      case 'daily':
        now.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        break;
    }
    deadline = now.toISOString().split('T')[0];
    await addDoc(collection(db, 'tasks'), {
      title: '',
      type: 'recurring',
      status: 'todo',
      priority: 'normal',
      deadline,
      recurrence,
      recurringTime: '',
      recurringDays: recurrence === 'weekly' ? [] : undefined,
      recurringDate: recurrence === 'monthly' ? new Date().getDate() : undefined,
      lastCompletedAt: '',
      lastAutoAdvanced: '',
      createdAt: serverTimestamp(),
      createdBy: effectiveUserId,
      createdByName: effectiveUserName,
    });
  };

  const handleRecurringDone = async (task: TaskDoc) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const base = task.deadline ? new Date(task.deadline) : new Date();
    const nextDeadline = getNextRecurringDeadline(task.recurrence || 'daily', base, task.recurringDays, task.recurringDate);
    await updateTask(task.id, {
      lastCompletedAt: todayStr,
      deadline: nextDeadline,
      status: 'todo',
    });
  };

  const createSubTask = async (listId: string) => {
    await addDoc(collection(db, 'tasks', listId, 'subtasks'), {
      title: '',
      status: 'todo',
      priority: 'normal',
      deadline: '',
      customFields: {},
      createdAt: serverTimestamp(),
    });
  };

  const updateTask = useCallback(async (taskId: string, data: Partial<TaskDoc>) => {
    await updateDoc(doc(db, 'tasks', taskId), data);
  }, []);

  const updateSubTask = async (listId: string, subId: string, data: Partial<SubTaskDoc>) => {
    await updateDoc(doc(db, 'tasks', listId, 'subtasks', subId), data);
  };

  const deleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);

    // Dual-confirm: if task was requested and user is NOT admin/manager,
    // set deletionPending instead of deleting — requester must approve
    if (task?.requestedByUserId && !isManagerOrAdmin) {
      await updateDoc(doc(db, 'tasks', taskId), {
        deletionPending: true,
        deletionRequestedBy: user!.uid,
        deletionRequestedByName: profile?.displayName || profile?.email || 'Unknown',
        deletionRequestedAt: new Date().toISOString(),
      });
      return;
    }

    // Normal delete (admin/manager or non-requested task)
    const subSnap = await getDocs(collection(db, 'tasks', taskId, 'subtasks'));
    for (const d of subSnap.docs) {
      await deleteDoc(doc(db, 'tasks', taskId, 'subtasks', d.id));
    }
    await deleteDoc(doc(db, 'tasks', taskId));
  };

  const deleteSubTask = async (listId: string, subId: string) => {
    await deleteDoc(doc(db, 'tasks', listId, 'subtasks', subId));
  };

  // ─── List Sub-Items CRUD ────────────────────────────────
  const addListSubItem = async (listId: string, taskId: string) => {
    const sub = subTasks[listId]?.find(s => s.id === taskId);
    if (!sub) return;
    const newItem: SubItem = { id: `si_${Date.now()}`, title: '', status: 'todo', deadline: '' };
    await updateDoc(doc(db, 'tasks', listId, 'subtasks', taskId), {
      subItems: [...(sub.subItems || []), newItem],
    });
  };

  const updateListSubItem = async (listId: string, taskId: string, itemId: string, data: Partial<SubItem>) => {
    const sub = subTasks[listId]?.find(s => s.id === taskId);
    if (!sub) return;
    const items = (sub.subItems || []).map(i => i.id === itemId ? { ...i, ...data } : i);
    await updateDoc(doc(db, 'tasks', listId, 'subtasks', taskId), { subItems: items });
  };

  const deleteListSubItem = async (listId: string, taskId: string, itemId: string) => {
    const sub = subTasks[listId]?.find(s => s.id === taskId);
    if (!sub) return;
    const items = (sub.subItems || []).filter(i => i.id !== itemId);
    await updateDoc(doc(db, 'tasks', listId, 'subtasks', taskId), { subItems: items });
  };

  const toggleListItemExpand = (subId: string) => {
    setExpandedListItems(prev => {
      const next = new Set(prev);
      next.has(subId) ? next.delete(subId) : next.add(subId);
      return next;
    });
  };

  // ─── Custom Columns ──────────────────────────────────────
  const addCustomColumn = async (listId: string, column: Omit<CustomColumn, 'id'>) => {
    const listTask = tasks.find(t => t.id === listId);
    if (!listTask) return;
    const newCol: CustomColumn = { ...column, id: `col_${Date.now()}` };
    const updatedCols = [...(listTask.customColumns || []), newCol];
    await updateDoc(doc(db, 'tasks', listId), { customColumns: updatedCols });
  };

  const deleteCustomColumn = async (listId: string, colId: string) => {
    const listTask = tasks.find(t => t.id === listId);
    if (!listTask) return;
    const updatedCols = (listTask.customColumns || []).filter(c => c.id !== colId);
    await updateDoc(doc(db, 'tasks', listId), { customColumns: updatedCols });
  };

  const updateCustomColumnName = async (listId: string, colId: string, newName: string) => {
    const listTask = tasks.find(t => t.id === listId);
    if (!listTask) return;
    const updatedCols = (listTask.customColumns || []).map(c => c.id === colId ? { ...c, name: newName } : c);
    await updateDoc(doc(db, 'tasks', listId), { customColumns: updatedCols });
  };

  const updateSubTaskCustomField = async (listId: string, subId: string, colId: string, value: unknown) => {
    const sub = subTasks[listId]?.find(s => s.id === subId);
    if (!sub) return;
    const updatedFields = { ...(sub.customFields || {}), [colId]: value };
    await updateDoc(doc(db, 'tasks', listId, 'subtasks', subId), { customFields: updatedFields });
  };

  // ─── Helpers ──────────────────────────────────────────────
  const toggleListExpand = (id: string) => {
    setExpandedLists(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel = 'Confirm', confirmClass = 'btn-error') => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, confirmLabel, confirmClass });
  };

  const closeConfirm = () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, confirmLabel: 'Confirm', confirmClass: 'btn-error' });

  const moveSection = (key: SectionKey, direction: 'up' | 'down') => {
    setSectionOrder(prev => {
      const idx = prev.indexOf(key);
      if (direction === 'up' && idx > 0) {
        const next = [...prev];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        return next;
      }
      if (direction === 'down' && idx < prev.length - 1) {
        const next = [...prev];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        return next;
      }
      return prev;
    });
  };

  // Close add-task popup on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addTaskPopupRef.current && !addTaskPopupRef.current.contains(e.target as Node)) {
        setAddTaskPopupOpen(false);
      }
    };
    if (addTaskPopupOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addTaskPopupOpen]);

  // Reusable inline add-task popup
  const addTaskBtnRef = useRef<HTMLButtonElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);

  const handleTogglePopup = () => {
    if (addTaskPopupOpen) {
      setAddTaskPopupOpen(false);
      return;
    }
    if (addTaskBtnRef.current) {
      const rect = addTaskBtnRef.current.getBoundingClientRect();
      const popupH = 260; // approximate popup height
      const popupW = 192;
      let top = rect.top - popupH - 8;
      if (top < 8) top = rect.bottom + 8; // flip below if no room above
      let left = rect.left + rect.width / 2 - popupW / 2;
      if (left < 8) left = 8;
      if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
      setPopupPos({ top, left });
    }
    setAddTaskPopupOpen(true);
  };

  const AddTaskPopupButton: React.FC<{ centered?: boolean }> = ({ centered }) => (
    <div className={centered ? 'flex flex-col items-center justify-center min-h-[50vh]' : 'border border-dashed border-base-300 rounded-lg p-6 flex items-center justify-center'} ref={addTaskPopupRef}>
      <button
        ref={addTaskBtnRef}
        onClick={handleTogglePopup}
        className={`btn btn-circle ${centered ? 'btn-lg' : 'btn-md'} btn-primary shadow-lg`}
        title="Add Task"
      >
        <Plus className={centered ? 'w-7 h-7' : 'w-5 h-5'} />
      </button>
      {centered && <p className="text-sm text-base-content/50 mt-3">Add your first task</p>}
      {addTaskPopupOpen && popupPos && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setAddTaskPopupOpen(false)} />
          <div className="fixed z-[9999] menu p-2 shadow-xl bg-base-100 rounded-box w-48 border border-base-200" style={{ top: popupPos.top, left: popupPos.left }}>
            <button onClick={() => { createSimpleTask(); setAddTaskPopupOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-sm w-full text-left"><CheckSquare className="w-4 h-4 text-primary" /> Simple Task</button>
            <button onClick={() => { createListTask(); setAddTaskPopupOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-sm w-full text-left"><LayoutList className="w-4 h-4 text-secondary" /> List Task</button>
            <div className="text-xs text-base-content/40 px-3 pt-2 pb-1">Recurring</div>
            <button onClick={() => { createRecurringTask('daily'); setAddTaskPopupOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-sm w-full text-left"><Sun className="w-4 h-4 text-accent" /> Daily</button>
            <button onClick={() => { createRecurringTask('weekly'); setAddTaskPopupOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-sm w-full text-left"><CalendarRange className="w-4 h-4 text-accent" /> Weekly</button>
            <button onClick={() => { createRecurringTask('monthly'); setAddTaskPopupOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-base-200 text-sm w-full text-left"><CalendarDays className="w-4 h-4 text-accent" /> Monthly</button>
          </div>
        </>
      )}
    </div>
  );

  const openColumnModal = (listId: string) => {
    setColumnModalListId(listId);
    setColumnModalOpen(true);
  };

  const filterTasks = <T extends TaskDoc>(list: T[]): T[] => {
    return list.filter(task => {
      const matchesSearch = !searchTerm || task.title?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  };

  // ─── Render ───────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-base-content/50">
        <LayoutList className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium mb-2">Sign in Required</p>
        <p className="text-sm">Please sign in to manage tasks</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center bg-base-100 p-3 rounded-xl shadow-sm border border-base-200 shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <LayoutList className="w-5 h-5 text-primary" />
            {targetUserName ? `${targetUserName}'s Tasks` : 'Task Manager'}
          </h1>
          <p className="text-xs text-base-content/60 mt-0.5">Click on any field to edit inline</p>
        </div>
        {canAddTasks && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRequestsSectionOpen(prev => !prev)}
              className={`btn btn-sm gap-2 relative ${requestsSectionOpen ? 'btn-primary' : 'btn-ghost'}`}
              title="Task Requests"
            >
              <Inbox className="w-4 h-4" />
              Requests
              {pendingRequestCount > 0 && (
                <span className="badge badge-xs badge-warning">{pendingRequestCount}</span>
              )}
            </button>
            <button
              onClick={() => setRequestModalOpen(true)}
              className="btn btn-sm btn-ghost gap-2"
              title="Request Task"
            >
              <Send className="w-4 h-4" />
              Request Task
            </button>
            <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-sm btn-primary gap-2">
              <Plus className="w-4 h-4" />
              Add Task
              <ChevronDown className="w-3 h-3" />
            </div>
            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-48 border border-base-200">
              <li><button onClick={() => { createSimpleTask(); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><CheckSquare className="w-4 h-4 text-primary" /> Simple Task</button></li>
              <li><button onClick={() => { createListTask(); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><LayoutList className="w-4 h-4 text-secondary" /> List Task</button></li>
              <li className="menu-title text-xs mt-1 mb-0.5">Recurring</li>
              <li><button onClick={() => { createRecurringTask('daily'); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><Sun className="w-4 h-4 text-accent" /> Daily</button></li>
              <li><button onClick={() => { createRecurringTask('weekly'); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><CalendarRange className="w-4 h-4 text-accent" /> Weekly</button></li>
              <li><button onClick={() => { createRecurringTask('monthly'); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-accent" /> Monthly</button></li>
            </ul>
          </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 items-center bg-base-200/50 p-2 sm:p-3 rounded-lg shrink-0">
        <div className="relative flex-1 min-w-[140px] sm:min-w-[200px]">
          <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-base-content/50" />
          <input type="text" placeholder="Search tasks..." className="input input-xs sm:input-sm input-bordered w-full pl-7 sm:pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="select select-xs sm:select-sm select-bordered" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="done">Done</option>
        </select>
      </div>

      {/* Inline Requests Section */}
      <TaskRequestsSection
        isOpen={requestsSectionOpen}
        onSendRequest={() => setRequestModalOpen(true)}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6 sm:space-y-8">
          {sectionOrder.map((sectionKey, sectionIdx) => {
            // ===== SIMPLE TASKS =====
            if (sectionKey === 'simple' && allSimple.length > 0) return (
            <div key="simple" className="overflow-hidden">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <h3 className="font-semibold text-base sm:text-lg">Simple Tasks</h3>
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => moveSection('simple', 'up')} disabled={sectionIdx === 0} className="btn btn-ghost btn-xs btn-circle disabled:opacity-20" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                  <button onClick={() => moveSection('simple', 'down')} disabled={sectionIdx === sectionOrder.length - 1} className="btn btn-ghost btn-xs btn-circle disabled:opacity-20" title="Move down"><ArrowDown className="w-3 h-3" /></button>
                  <div className="w-px h-4 bg-base-300 mx-1"></div>
                  <div className="flex gap-1">
                    <button onClick={() => setSimpleTab('active')} className={`btn btn-xs ${simpleTab === 'active' ? 'btn-primary' : 'btn-ghost'}`}>
                      Active <span className="badge badge-xs ml-1">{simpleActiveCount}</span>
                    </button>
                    <button onClick={() => setSimpleTab('completed')} className={`btn btn-xs ${simpleTab === 'completed' ? 'btn-success' : 'btn-ghost'}`}>
                      Completed <span className="badge badge-xs ml-1">{simpleCompletedCount}</span>
                    </button>
                  </div>
                </div>
              </div>

              {filterTasks(simpleTasks).length === 0 ? (
                <div className="text-center py-6 text-base-content/40 italic border border-base-200 rounded-lg">
                  {simpleTab === 'completed' ? 'No completed simple tasks' : 'No active simple tasks'}
                </div>
              ) : (
              <div className="overflow-x-auto border border-base-200 rounded-lg">
                <table className="table table-xs sm:table-sm w-full min-w-[400px]">
                  <thead className="bg-base-200/50">
                    <tr>
                      <th className="w-6 sm:w-8"></th>
                      <th className="w-8 sm:w-10"></th>
                      <th className="min-w-[120px]">Task Name</th>
                      <th className="w-24 sm:w-32 min-w-[96px]">Status</th>
                      <th className="w-32 sm:w-36 min-w-[100px]">Due Date</th>
                      <th className="w-8 sm:w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterTasks(simpleTasks).map(task => {
                      const taskEditable = canEditTask(task);
                      const taskDeletable = canDeleteTask(task);
                      const taskStatusChangeable = canChangeTaskStatus(task);
                      const taskSubs = subTasks[task.id] || [];
                      const isExpanded = expandedLists.has(task.id);
                      const overdue = isTaskOverdue(task);
                      return (
                      <React.Fragment key={task.id}>
                      <tr className={`hover group ${overdue ? 'bg-error/5' : ''}`}>
                        <td className="px-1">
                          <button onClick={() => toggleListExpand(task.id)} className="btn btn-ghost btn-xs btn-circle">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs sm:checkbox-sm checkbox-primary"
                            checked={task.status === 'done'}
                            onChange={() => taskStatusChangeable && updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })}
                            disabled={!taskStatusChangeable}
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            {taskEditable ? (
                              <EditableCell
                                value={task.title}
                                onSave={val => updateTask(task.id, { title: val })}
                                placeholder="Enter task name..."
                                className={task.status === 'done' ? 'line-through opacity-50' : ''}
                              />
                            ) : (
                              <span className={`px-2 py-1 ${task.status === 'done' ? 'line-through opacity-50' : ''}`}>
                                {task.title || 'Untitled Task'}
                              </span>
                            )}
                            {task.requestedByUserName && (
                              <div className="tooltip tooltip-top" data-tip={`Requested by ${task.requestedByUserName}`}>
                                <span className="badge badge-xs gap-1 badge-accent badge-outline cursor-default">
                                  <User className="w-2.5 h-2.5" />
                                  {task.requestedByUserName.split(' ')[0]}
                                </span>
                              </div>
                            )}
                            {taskSubs.length > 0 && (
                              <span className="badge badge-xs badge-primary/20 text-primary">{taskSubs.filter(s => s.status === 'done').length}/{taskSubs.length}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {taskStatusChangeable ? (
                            <StatusDropdown value={task.status} onChange={val => updateTask(task.id, { status: val })} />
                          ) : (
                            <span className={`badge badge-sm ${task.status === 'done' ? 'badge-success' : task.status === 'in_progress' ? 'badge-warning' : task.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                              {task.status === 'in_progress' ? 'In Progress' : task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || 'To Do'}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                          {taskEditable ? (
                            <DatePickerPopover value={task.deadline} onSave={val => updateTask(task.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                          ) : (
                            <span className="text-xs sm:text-sm px-2">{task.deadline ? new Date(task.deadline).toLocaleDateString() : '-'}</span>
                          )}
                          {overdue && <span className="badge badge-xs badge-error gap-1"><AlertCircle className="w-2.5 h-2.5" />Overdue</span>}
                          </div>
                        </td>
                        <td>
                          {task.deletionPending ? (
                            <span className="badge badge-xs badge-error gap-1 whitespace-nowrap" title="Waiting for requester approval">
                              <Clock className="w-2.5 h-2.5" />Deletion Pending
                            </span>
                          ) : taskDeletable ? (
                            <button
                              onClick={() => showConfirm('Delete Task', task.requestedByUserId && !isManagerOrAdmin ? `"${task.title}" was requested by ${task.requestedByUserName}. A deletion request will be sent for approval.` : `Are you sure you want to delete "${task.title}"?`, () => deleteTask(task.id), task.requestedByUserId && !isManagerOrAdmin ? 'Request Deletion' : 'Delete')}
                              className="btn btn-ghost btn-xs text-error opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          ) : null}
                          {simpleTab === 'completed' && taskStatusChangeable && (
                            <button
                              onClick={() => updateTask(task.id, { status: 'todo' })}
                              className="btn btn-ghost btn-xs text-primary opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                              title="Restore to active"
                            >
                              <Undo2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Subtasks for this simple task */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-0 bg-base-200/20">
                            <div className="ml-8 sm:ml-12 pl-4 pr-2 py-2 border-l-2 border-primary/20">
                              {taskSubs.length > 0 && (
                                <table className="table table-xs w-full">
                                  <tbody>
                                    {taskSubs.map(sub => (
                                      <tr key={sub.id} className="hover group/sub">
                                        <td className="w-8">
                                          <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={sub.status === 'done'} onChange={() => taskStatusChangeable && updateSubTask(task.id, sub.id, { status: sub.status === 'done' ? 'todo' : 'done' })} disabled={!taskStatusChangeable} />
                                        </td>
                                        <td>
                                          {taskEditable ? (
                                            <EditableCell value={sub.title} onSave={val => updateSubTask(task.id, sub.id, { title: val })} placeholder="Subtask name..." className={`text-sm ${sub.status === 'done' ? 'line-through opacity-50' : ''}`} />
                                          ) : (
                                            <span className={`text-sm px-2 ${sub.status === 'done' ? 'line-through opacity-50' : ''}`}>{sub.title || 'Untitled Subtask'}</span>
                                          )}
                                        </td>
                                        <td className="w-24">
                                          {taskStatusChangeable ? (
                                            <StatusDropdown value={sub.status} onChange={val => updateSubTask(task.id, sub.id, { status: val })} />
                                          ) : (
                                            <span className={`badge badge-sm ${sub.status === 'done' ? 'badge-success' : sub.status === 'in_progress' ? 'badge-warning' : sub.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                                              {sub.status === 'in_progress' ? 'In Progress' : sub.status?.charAt(0).toUpperCase() + sub.status?.slice(1) || 'To Do'}
                                            </span>
                                          )}
                                        </td>
                                        <td className="w-28">
                                          {taskEditable ? (
                                            <DatePickerPopover value={sub.deadline} onSave={val => updateSubTask(task.id, sub.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                                          ) : (
                                            <span className="text-xs px-2">{sub.deadline ? new Date(sub.deadline).toLocaleDateString() : '-'}</span>
                                          )}
                                        </td>
                                        <td className="w-8">
                                          {taskDeletable && (
                                            <button onClick={() => showConfirm('Delete Subtask', `Are you sure you want to delete "${sub.title}"?`, () => deleteSubTask(task.id, sub.id), 'Delete')} className="btn btn-ghost btn-xs text-error opacity-0 group-hover/sub:opacity-100">
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {canAddTasks && (
                                <button onClick={() => createSubTask(task.id)} className="btn btn-ghost btn-xs w-full mt-1 text-primary border-dashed border border-base-300 hover:border-primary">
                                  <Plus className="w-3 h-3" /> Add Subtask
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}

              {canAddTasks && (
                <button onClick={createSimpleTask} className="btn btn-ghost btn-xs w-full mt-2 text-primary border-dashed border border-base-300 hover:border-primary">
                  <Plus className="w-3 h-3" /> Add Simple Task
                </button>
              )}
            </div>
          );

            // ===== RECURRING TASKS =====
            if (sectionKey === 'recurring' && allRecurring.length > 0) return (
            <div key="recurring" className="overflow-hidden">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <Repeat className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                <h3 className="font-semibold text-base sm:text-lg">Recurring Tasks</h3>
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => moveSection('recurring', 'up')} disabled={sectionIdx === 0} className="btn btn-ghost btn-xs btn-circle disabled:opacity-20" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                  <button onClick={() => moveSection('recurring', 'down')} disabled={sectionIdx === sectionOrder.length - 1} className="btn btn-ghost btn-xs btn-circle disabled:opacity-20" title="Move down"><ArrowDown className="w-3 h-3" /></button>
                  <div className="w-px h-4 bg-base-300 mx-1"></div>
                  <div className="flex gap-1">
                    <button onClick={() => setRecurringTab('active')} className={`btn btn-xs ${recurringTab === 'active' ? 'btn-accent' : 'btn-ghost'}`}>
                      Active <span className="badge badge-xs ml-1">{recurringActiveCount}</span>
                    </button>
                    <button onClick={() => setRecurringTab('completed')} className={`btn btn-xs ${recurringTab === 'completed' ? 'btn-success' : 'btn-ghost'}`}>
                      Completed <span className="badge badge-xs ml-1">{recurringCompletedCount}</span>
                    </button>
                  </div>
                </div>
              </div>

              {filterTasks(recurringTasks).length === 0 ? (
                <div className="text-center py-6 text-base-content/40 italic border border-base-200 rounded-lg">
                  {recurringTab === 'completed' ? 'No completed recurring tasks' : 'No active recurring tasks'}
                </div>
              ) : (
              <div className="overflow-x-auto border border-base-200 rounded-lg">
                <table className="table table-xs sm:table-sm w-full min-w-[500px]">
                  <thead className="bg-base-200/50">
                    <tr>
                      <th className="w-6 sm:w-8"></th>
                      <th className="w-8 sm:w-10"></th>
                      <th className="min-w-[120px]">Task Name</th>
                      <th className="w-24 sm:w-28">Frequency</th>
                      <th className="w-24 sm:w-32 min-w-[96px]">Status</th>
                      <th className="w-32 sm:w-36 min-w-[100px]">Next Due</th>
                      <th className="w-32 sm:w-36 min-w-[100px]">Last Done</th>
                      <th className="w-8 sm:w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterTasks(recurringTasks).map(task => {
                      const taskEditable = canEditTask(task);
                      const taskDeletable = canDeleteTask(task);
                      const taskStatusChangeable = canChangeTaskStatus(task);
                      const taskSubs = subTasks[task.id] || [];
                      const isExpanded = expandedLists.has(task.id);
                      const overdue = isTaskOverdue(task);
                      return (
                      <React.Fragment key={task.id}>
                      <tr className={`hover group ${overdue ? 'bg-error/5' : ''}`}>
                        <td className="px-1">
                          <button onClick={() => toggleListExpand(task.id)} className="btn btn-ghost btn-xs btn-circle">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        </td>
                        <td>
                          <button
                            onClick={() => taskStatusChangeable && showConfirm(
                              'Complete Recurring Task',
                              `Mark "${task.title || 'Untitled Task'}" as done for this ${task.recurrence || 'period'}? It will reset and the next due date will be set automatically.`,
                              () => handleRecurringDone(task),
                              'Complete',
                              'btn-success'
                            )}
                            className="btn btn-ghost btn-xs btn-circle text-accent hover:bg-accent/10"
                            title="Mark done for this period"
                            disabled={!taskStatusChangeable}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            {taskEditable ? (
                              <EditableCell value={task.title} onSave={val => updateTask(task.id, { title: val })} placeholder="Enter task name..." />
                            ) : (
                              <span className="px-2 py-1">{task.title || 'Untitled Task'}</span>
                            )}
                            {task.requestedByUserName && (
                              <div className="tooltip tooltip-top" data-tip={`Requested by ${task.requestedByUserName}`}>
                                <span className="badge badge-xs gap-1 badge-accent badge-outline cursor-default">
                                  <User className="w-2.5 h-2.5" />
                                  {task.requestedByUserName.split(' ')[0]}
                                </span>
                              </div>
                            )}
                            {taskSubs.length > 0 && (
                              <span className="badge badge-xs badge-accent/20 text-accent">{taskSubs.filter(s => s.status === 'done').length}/{taskSubs.length}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div>
                            {taskEditable ? (
                              <RecurrenceDropdown value={task.recurrence || 'daily'} onChange={val => updateTask(task.id, { recurrence: val as 'daily' | 'weekly' | 'monthly' })} />
                            ) : (
                              <span className="badge badge-sm badge-accent badge-outline">
                                {task.recurrence?.charAt(0).toUpperCase() + (task.recurrence?.slice(1) || '')}
                              </span>
                            )}
                            <div className="text-[10px] text-base-content/40 mt-0.5">
                              {task.recurrence === 'daily' && task.recurringTime && `at ${task.recurringTime}`}
                              {task.recurrence === 'weekly' && (task.recurringDays || []).length > 0 && (task.recurringDays || []).join(', ')}
                              {task.recurrence === 'monthly' && task.recurringDate ? `Day ${task.recurringDate}` : ''}
                            </div>
                          </div>
                        </td>
                        <td>
                          {taskStatusChangeable ? (
                            <StatusDropdown value={task.status} onChange={val => updateTask(task.id, { status: val })} />
                          ) : (
                            <span className={`badge badge-sm ${task.status === 'done' ? 'badge-success' : task.status === 'in_progress' ? 'badge-warning' : task.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                              {task.status === 'in_progress' ? 'In Progress' : task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || 'To Do'}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            {taskEditable ? (
                              <DatePickerPopover value={task.deadline} onSave={val => updateTask(task.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                            ) : (
                              <span className="text-xs sm:text-sm px-2">{task.deadline ? new Date(task.deadline).toLocaleDateString() : '-'}</span>
                            )}
                            {overdue && <span className="badge badge-xs badge-error gap-1"><AlertCircle className="w-2.5 h-2.5" />Overdue</span>}
                          </div>
                        </td>
                        <td>
                          <span className="text-xs text-base-content/60">
                            {task.lastCompletedAt ? new Date(task.lastCompletedAt).toLocaleDateString() : 'Never'}
                          </span>
                        </td>
                        <td>
                          {task.deletionPending ? (
                            <span className="badge badge-xs badge-error gap-1 whitespace-nowrap" title="Waiting for requester approval">
                              <Clock className="w-2.5 h-2.5" />Deletion Pending
                            </span>
                          ) : taskDeletable ? (
                            <button onClick={() => showConfirm('Delete Task', task.requestedByUserId && !isManagerOrAdmin ? `"${task.title}" was requested by ${task.requestedByUserName}. A deletion request will be sent for approval.` : `Delete "${task.title}"?`, () => deleteTask(task.id), task.requestedByUserId && !isManagerOrAdmin ? 'Request Deletion' : 'Delete')} className="btn btn-ghost btn-xs text-error opacity-60 sm:opacity-0 sm:group-hover:opacity-100">
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          ) : null}
                          {recurringTab === 'completed' && taskStatusChangeable && (
                            <button onClick={() => updateTask(task.id, { status: 'todo' })} className="btn btn-ghost btn-xs text-primary opacity-60 sm:opacity-0 sm:group-hover:opacity-100" title="Restore to active">
                              <Undo2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Expanded: Schedule Details + Subtasks */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-base-200/20">
                            <div className="ml-8 sm:ml-12 pl-4 pr-2 py-3 space-y-3 border-l-2 border-accent/20">
                              {/* Schedule Details */}
                              <div className="flex items-center gap-3 flex-wrap text-sm border-b border-base-200 pb-3">
                                <span className="text-xs font-medium text-base-content/60 flex items-center gap-1"><Clock className="w-3 h-3" /> Schedule:</span>
                                {task.recurrence === 'daily' && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-base-content/50">Every day at</span>
                                    {taskEditable ? (
                                      <input type="time" className="input input-xs input-bordered w-28" value={task.recurringTime || ''} onChange={e => updateTask(task.id, { recurringTime: e.target.value })} />
                                    ) : (
                                      <span className="text-xs font-medium">{task.recurringTime || 'Not set'}</span>
                                    )}
                                  </div>
                                )}
                                {task.recurrence === 'weekly' && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-xs text-base-content/50 mr-1">On:</span>
                                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => (
                                      taskEditable ? (
                                        <button key={day}
                                          onClick={() => {
                                            const current = task.recurringDays || [];
                                            const next = current.includes(day) ? current.filter((d: string) => d !== day) : [...current, day];
                                            updateTask(task.id, { recurringDays: next });
                                          }}
                                          className={`btn btn-xs ${(task.recurringDays || []).includes(day) ? 'btn-accent' : 'btn-ghost border-base-300'}`}
                                        >{day}</button>
                                      ) : (
                                        <span key={day} className={`badge badge-xs ${(task.recurringDays || []).includes(day) ? 'badge-accent' : 'badge-ghost'}`}>{day}</span>
                                      )
                                    ))}
                                  </div>
                                )}
                                {task.recurrence === 'monthly' && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-base-content/50">On day</span>
                                    {taskEditable ? (
                                      <input type="number" min={1} max={31} className="input input-xs input-bordered w-16" value={task.recurringDate || ''} onChange={e => updateTask(task.id, { recurringDate: parseInt(e.target.value) || 0 })} placeholder="1-31" />
                                    ) : (
                                      <span className="text-xs font-medium">{task.recurringDate || 'Not set'}</span>
                                    )}
                                    <span className="text-xs text-base-content/50">of every month</span>
                                  </div>
                                )}
                              </div>
                              {/* Subtasks */}
                              {taskSubs.length > 0 && (
                                <table className="table table-xs w-full">
                                  <tbody>
                                    {taskSubs.map(sub => (
                                      <tr key={sub.id} className="hover group/sub">
                                        <td className="w-8">
                                          <input type="checkbox" className="checkbox checkbox-xs checkbox-accent" checked={sub.status === 'done'} onChange={() => taskStatusChangeable && updateSubTask(task.id, sub.id, { status: sub.status === 'done' ? 'todo' : 'done' })} disabled={!taskStatusChangeable} />
                                        </td>
                                        <td>
                                          {taskEditable ? (
                                            <EditableCell value={sub.title} onSave={val => updateSubTask(task.id, sub.id, { title: val })} placeholder="Subtask name..." className={`text-sm ${sub.status === 'done' ? 'line-through opacity-50' : ''}`} />
                                          ) : (
                                            <span className={`text-sm px-2 ${sub.status === 'done' ? 'line-through opacity-50' : ''}`}>{sub.title || 'Untitled Subtask'}</span>
                                          )}
                                        </td>
                                        <td className="w-24">
                                          {taskStatusChangeable ? (
                                            <StatusDropdown value={sub.status} onChange={val => updateSubTask(task.id, sub.id, { status: val })} />
                                          ) : (
                                            <span className={`badge badge-sm ${sub.status === 'done' ? 'badge-success' : sub.status === 'in_progress' ? 'badge-warning' : sub.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                                              {sub.status === 'in_progress' ? 'In Progress' : sub.status?.charAt(0).toUpperCase() + sub.status?.slice(1) || 'To Do'}
                                            </span>
                                          )}
                                        </td>
                                        <td className="w-28">
                                          {taskEditable ? (
                                            <DatePickerPopover value={sub.deadline} onSave={val => updateSubTask(task.id, sub.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                                          ) : (
                                            <span className="text-xs px-2">{sub.deadline ? new Date(sub.deadline).toLocaleDateString() : '-'}</span>
                                          )}
                                        </td>
                                        <td className="w-8">
                                          {taskDeletable && (
                                            <button onClick={() => showConfirm('Delete Subtask', `Delete "${sub.title}"?`, () => deleteSubTask(task.id, sub.id), 'Delete')} className="btn btn-ghost btn-xs text-error opacity-0 group-hover/sub:opacity-100">
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {canAddTasks && (
                                <button onClick={() => createSubTask(task.id)} className="btn btn-ghost btn-xs w-full mt-1 text-accent border-dashed border border-base-300 hover:border-accent">
                                  <Plus className="w-3 h-3" /> Add Subtask
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}

              {canAddTasks && (
                <div className="dropdown dropdown-top mt-2">
                  <div tabIndex={0} role="button" className="btn btn-ghost btn-xs w-full text-accent border-dashed border border-base-300 hover:border-accent">
                    <Plus className="w-3 h-3" /> Add Recurring Task
                  </div>
                  <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-40 border border-base-200 mb-1">
                    <li><button onClick={() => { createRecurringTask('daily'); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><Sun className="w-4 h-4" /> Daily</button></li>
                    <li><button onClick={() => { createRecurringTask('weekly'); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><CalendarRange className="w-4 h-4" /> Weekly</button></li>
                    <li><button onClick={() => { createRecurringTask('monthly'); (document.activeElement as HTMLElement)?.blur(); }} className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Monthly</button></li>
                  </ul>
                </div>
              )}
            </div>
          );

            // ===== LIST TASKS =====
            if (sectionKey === 'list' && allList.length > 0) return (
            <div key="list" className="overflow-hidden">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <LayoutList className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" />
                <h3 className="font-semibold text-base sm:text-lg">List Tasks</h3>
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => moveSection('list', 'up')} disabled={sectionIdx === 0} className="btn btn-ghost btn-xs btn-circle disabled:opacity-20" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                  <button onClick={() => moveSection('list', 'down')} disabled={sectionIdx === sectionOrder.length - 1} className="btn btn-ghost btn-xs btn-circle disabled:opacity-20" title="Move down"><ArrowDown className="w-3 h-3" /></button>
                  <div className="w-px h-4 bg-base-300 mx-1"></div>
                  <div className="flex gap-1">
                    <button onClick={() => setListTab('active')} className={`btn btn-xs ${listTab === 'active' ? 'btn-secondary' : 'btn-ghost'}`}>
                      Active <span className="badge badge-xs ml-1">{listActiveCount}</span>
                    </button>
                    <button onClick={() => setListTab('completed')} className={`btn btn-xs ${listTab === 'completed' ? 'btn-success' : 'btn-ghost'}`}>
                      Completed <span className="badge badge-xs ml-1">{listCompletedCount}</span>
                    </button>
                  </div>
                </div>
              </div>

              {filterTasks(listTasks).length === 0 ? (
                <div className="text-center py-6 text-base-content/40 italic border border-base-200 rounded-lg">
                  {listTab === 'completed' ? 'No completed list tasks' : 'No active list tasks'}
                </div>
              ) : (
              <div className="space-y-3 sm:space-y-4">
                {filterTasks(listTasks).map(list => {
                  const listEditable = canEditTask(list);
                  const listDeletable = canDeleteTask(list);
                  const listStatusChangeable = canChangeTaskStatus(list);
                  const listOverdue = isTaskOverdue(list);
                  return (
                  <div key={list.id} className={`border rounded-lg overflow-hidden bg-base-100 shadow-sm ${listOverdue ? 'border-error/30' : 'border-base-200'}`}>
                    {/* List Header */}
                    <div className="bg-base-200/30 p-2 sm:p-3 border-b border-base-200 overflow-x-auto">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-max">
                        <button onClick={() => toggleListExpand(list.id)} className="btn btn-ghost btn-xs btn-circle flex-shrink-0">
                          {expandedLists.has(list.id) ? <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" /> : <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />}
                        </button>

                        <div className="flex-1 min-w-[100px] sm:min-w-[150px]">
                          <div className="flex items-center gap-1">
                          {listEditable ? (
                            <EditableCell value={list.title} onSave={val => updateTask(list.id, { title: val })} placeholder="List name..." className="font-semibold text-sm sm:text-base" />
                          ) : (
                            <span className="font-semibold text-sm sm:text-base px-2">{list.title || 'Untitled List'}</span>
                          )}
                          {list.requestedByUserName && (
                            <div className="tooltip tooltip-top" data-tip={`Requested by ${list.requestedByUserName}`}>
                              <span className="badge badge-xs gap-1 badge-accent badge-outline cursor-default">
                                <User className="w-2.5 h-2.5" />
                                {list.requestedByUserName.split(' ')[0]}
                              </span>
                            </div>
                          )}
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          {listStatusChangeable ? (
                            <StatusDropdown value={list.status} onChange={val => updateTask(list.id, { status: val })} />
                          ) : (
                            <span className={`badge badge-xs sm:badge-sm ${list.status === 'done' ? 'badge-success' : list.status === 'in_progress' ? 'badge-warning' : list.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                              {list.status === 'in_progress' ? 'In Progress' : list.status?.charAt(0).toUpperCase() + list.status?.slice(1) || 'To Do'}
                            </span>
                          )}
                        </div>

                        <div className="flex-shrink-0">
                          {listEditable ? (
                            <PriorityDropdown value={list.priority} onChange={val => updateTask(list.id, { priority: val })} />
                          ) : (
                            <span className={`badge badge-sm ${list.priority === 'urgent' ? 'text-error bg-error/10' : list.priority === 'high' ? 'text-warning bg-warning/10' : list.priority === 'low' ? 'text-success bg-success/10' : 'text-info bg-info/10'}`}>
                              {list.priority?.charAt(0).toUpperCase() + list.priority?.slice(1) || 'Normal'}
                            </span>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-1">
                          {listEditable ? (
                            <DatePickerPopover value={list.deadline} onSave={val => updateTask(list.id, { deadline: val })} placeholder="Due date" className="text-xs" />
                          ) : (
                            <span className="text-xs px-2">{list.deadline ? new Date(list.deadline).toLocaleDateString() : '-'}</span>
                          )}
                          {listOverdue && <span className="badge badge-xs badge-error gap-1"><AlertCircle className="w-2.5 h-2.5" />Overdue</span>}
                        </div>

                        {list.deletionPending ? (
                          <span className="badge badge-xs badge-error gap-1 whitespace-nowrap flex-shrink-0" title="Waiting for requester approval">
                            <Clock className="w-2.5 h-2.5" />Deletion Pending
                          </span>
                        ) : listDeletable ? (
                          <button
                            onClick={() => showConfirm('Delete List', list.requestedByUserId && !isManagerOrAdmin ? `"${list.title}" was requested by ${list.requestedByUserName}. A deletion request will be sent for approval.` : `Are you sure you want to delete "${list.title}" and all its tasks?`, () => deleteTask(list.id), list.requestedByUserId && !isManagerOrAdmin ? 'Request Deletion' : 'Delete')}
                            className="btn btn-ghost btn-xs text-error flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                        {listTab === 'completed' && (
                          <button
                            onClick={() => updateTask(list.id, { status: 'todo' })}
                            className="btn btn-ghost btn-xs text-primary flex-shrink-0"
                            title="Restore to active"
                          >
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tasks Table */}
                    {expandedLists.has(list.id) && (
                      <div className="p-2 bg-base-100 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="table table-xs w-full min-w-[600px]">
                            <thead>
                              <tr className="text-xs text-base-content/50">
                                <th className="w-6"></th>
                                <th className="w-8"></th>
                                <th className="min-w-[120px]">Task</th>
                                <th className="w-24 min-w-[96px]">Status</th>
                                <th className="w-24 min-w-[96px]">Priority</th>
                                <th className="w-28 min-w-[112px]">Due Date</th>
                                {(list.customColumns || []).map(col => (
                                  <th key={col.id} className="w-28 min-w-[112px]">
                                    {listEditable ? (
                                      <ColumnHeader
                                        column={col}
                                        onSave={newName => updateCustomColumnName(list.id, col.id, newName)}
                                        onDelete={() => showConfirm('Delete Column', `Are you sure you want to delete the "${col.name}" column? All data in this column will be lost.`, () => deleteCustomColumn(list.id, col.id), 'Delete')}
                                      />
                                    ) : (
                                      <span>{col.name}</span>
                                    )}
                                  </th>
                                ))}
                                {listEditable && (
                                  <th className="w-10">
                                    <button onClick={() => openColumnModal(list.id)} className="btn btn-ghost btn-xs btn-circle text-primary hover:bg-primary/10" title="Add custom column">
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </th>
                                )}
                                {listEditable && <th className="w-8"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {(subTasks[list.id] || []).map(sub => {
                                const subItems = sub.subItems || [];
                                const isItemExpanded = expandedListItems.has(sub.id);
                                const subOverdue = isTaskOverdue(sub);
                                return (
                                <React.Fragment key={sub.id}>
                                <tr className={`hover group ${subOverdue ? 'bg-error/5' : ''}`}>
                                  <td className="px-1">
                                    <button onClick={() => toggleListItemExpand(sub.id)} className="btn btn-ghost btn-xs btn-circle">
                                      {isItemExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>
                                  </td>
                                  <td>
                                    <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={sub.status === 'done'} onChange={() => listStatusChangeable && updateSubTask(list.id, sub.id, { status: sub.status === 'done' ? 'todo' : 'done' })} disabled={!listStatusChangeable} />
                                  </td>
                                  <td>
                                    <div className="flex items-center gap-1">
                                      {listEditable ? (
                                        <EditableCell value={sub.title} onSave={val => updateSubTask(list.id, sub.id, { title: val })} placeholder="Task name..." className={`text-sm ${sub.status === 'done' ? 'line-through opacity-50' : ''}`} />
                                      ) : (
                                        <span className={`text-sm px-2 ${sub.status === 'done' ? 'line-through opacity-50' : ''}`}>{sub.title || 'Untitled Task'}</span>
                                      )}
                                      {subItems.length > 0 && (
                                        <span className="badge badge-xs badge-secondary/20 text-secondary">{subItems.filter(i => i.status === 'done').length}/{subItems.length}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    {listStatusChangeable ? (
                                      <StatusDropdown value={sub.status} onChange={val => updateSubTask(list.id, sub.id, { status: val })} />
                                    ) : (
                                      <span className={`badge badge-sm ${sub.status === 'done' ? 'badge-success' : sub.status === 'in_progress' ? 'badge-warning' : sub.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                                        {sub.status === 'in_progress' ? 'In Progress' : sub.status?.charAt(0).toUpperCase() + sub.status?.slice(1) || 'To Do'}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {listEditable ? (
                                      <PriorityDropdown value={sub.priority} onChange={val => updateSubTask(list.id, sub.id, { priority: val })} />
                                    ) : (
                                      <span className={`badge badge-sm ${sub.priority === 'urgent' ? 'text-error bg-error/10' : sub.priority === 'high' ? 'text-warning bg-warning/10' : sub.priority === 'low' ? 'text-success bg-success/10' : 'text-info bg-info/10'}`}>
                                        {sub.priority?.charAt(0).toUpperCase() + sub.priority?.slice(1) || 'Normal'}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <div className="flex items-center gap-1">
                                      {listEditable ? (
                                        <DatePickerPopover value={sub.deadline} onSave={val => updateSubTask(list.id, sub.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                                      ) : (
                                        <span className="text-xs px-2">{sub.deadline ? new Date(sub.deadline).toLocaleDateString() : '-'}</span>
                                      )}
                                      {subOverdue && <span className="badge badge-xs badge-error gap-1"><AlertCircle className="w-2.5 h-2.5" />Overdue</span>}
                                    </div>
                                  </td>
                                  {(list.customColumns || []).map(col => (
                                    <td key={col.id}>
                                      {listEditable ? (
                                        <CustomFieldCell column={col} value={sub.customFields?.[col.id]} onSave={val => updateSubTaskCustomField(list.id, sub.id, col.id, val)} />
                                      ) : (
                                        <span className="text-xs px-2">{sub.customFields?.[col.id] != null ? String(sub.customFields[col.id]) : '-'}</span>
                                      )}
                                    </td>
                                  ))}
                                  {listEditable && <td></td>}
                                  {listDeletable && (
                                    <td>
                                      <button onClick={() => showConfirm('Delete Task', `Delete "${sub.title}"?`, () => deleteSubTask(list.id, sub.id), 'Delete')} className="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                                {/* Sub-items for this list task */}
                                {isItemExpanded && (
                                  <tr>
                                    <td colSpan={99} className="p-0 bg-base-200/10">
                                      <div className="ml-10 sm:ml-14 pl-4 pr-2 py-2 border-l-2 border-secondary/20">
                                        {subItems.length > 0 && (
                                          <table className="table table-xs w-full">
                                            <tbody>
                                              {subItems.map((item) => (
                                                <tr key={item.id} className="hover group/si">
                                                  <td className="w-8">
                                                    <input type="checkbox" className="checkbox checkbox-xs checkbox-secondary" checked={item.status === 'done'} onChange={() => listStatusChangeable && updateListSubItem(list.id, sub.id, item.id, { status: item.status === 'done' ? 'todo' : 'done' })} disabled={!listStatusChangeable} />
                                                  </td>
                                                  <td>
                                                    {listEditable ? (
                                                      <EditableCell value={item.title} onSave={val => updateListSubItem(list.id, sub.id, item.id, { title: val })} placeholder="Subtask name..." className={`text-sm ${item.status === 'done' ? 'line-through opacity-50' : ''}`} />
                                                    ) : (
                                                      <span className={`text-sm px-2 ${item.status === 'done' ? 'line-through opacity-50' : ''}`}>{item.title || 'Untitled Subtask'}</span>
                                                    )}
                                                  </td>
                                                  <td className="w-28">
                                                    {listEditable ? (
                                                      <DatePickerPopover value={item.deadline} onSave={val => updateListSubItem(list.id, sub.id, item.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                                                    ) : (
                                                      <span className="text-xs px-2">{item.deadline ? new Date(item.deadline).toLocaleDateString() : '-'}</span>
                                                    )}
                                                  </td>
                                                  <td className="w-8">
                                                    {listDeletable && (
                                                      <button onClick={() => showConfirm('Delete Subtask', `Delete "${item.title}"?`, () => deleteListSubItem(list.id, sub.id, item.id), 'Delete')} className="btn btn-ghost btn-xs text-error opacity-0 group-hover/si:opacity-100">
                                                        <Trash2 className="w-3 h-3" />
                                                      </button>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                        {canAddTasks && (
                                          <button onClick={() => addListSubItem(list.id, sub.id)} className="btn btn-ghost btn-xs w-full mt-1 text-secondary border-dashed border border-base-300 hover:border-secondary">
                                            <Plus className="w-3 h-3" /> Add Subtask
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {canAddTasks && (
                          <button onClick={() => createSubTask(list.id)} className="btn btn-ghost btn-xs w-full mt-2 text-primary border-dashed border border-base-300 hover:border-primary">
                            <Plus className="w-3 h-3" /> Add Task
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              )}

              {canAddTasks && (
                <button onClick={createListTask} className="btn btn-ghost btn-xs w-full mt-2 text-secondary border-dashed border border-base-300 hover:border-secondary">
                  <Plus className="w-3 h-3" /> Add List Task
                </button>
              )}
            </div>
          );

            return null;
          })}

          {/* Empty State — centered + button */}
          {allSimple.length === 0 && allList.length === 0 && allRecurring.length === 0 && canAddTasks && (
            <AddTaskPopupButton centered />
          )}
          {allSimple.length === 0 && allList.length === 0 && allRecurring.length === 0 && !canAddTasks && (
            <div className="flex flex-col items-center justify-center py-16 text-base-content/50">
              <LayoutList className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">
                {targetUserName ? `No tasks for ${targetUserName}` : 'No tasks yet'}
              </p>
              <p className="text-sm">No tasks have been created yet</p>
            </div>
          )}

          {/* Bottom + button when tasks exist */}
          {(allSimple.length > 0 || allList.length > 0 || allRecurring.length > 0) && canAddTasks && (
            <AddTaskPopupButton />
          )}
        </div>
      )}

      {/* Modals */}
      <AddColumnModal
        isOpen={columnModalOpen}
        listId={columnModalListId}
        onClose={() => { setColumnModalOpen(false); setColumnModalListId(null); }}
        onAdd={addCustomColumn}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        confirmClass={confirmModal.confirmClass}
      />
      <RequestTaskModal isOpen={requestModalOpen} onClose={() => setRequestModalOpen(false)} />
    </div>
  );
}
