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
  Sun, Sunrise, CalendarRange, CalendarDays,
} from 'lucide-react';

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
  type: 'simple' | 'list';
  status: string;
  priority: string;
  deadline: string;
  createdAt: Timestamp | null;
  createdBy: string;
  links?: { title: string; url: string; id: number }[];
  customColumns?: CustomColumn[];
  [key: string]: unknown;
}

interface SubTaskDoc {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string;
  customFields?: Record<string, unknown>;
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

// ─── Confirm Modal ──────────────────────────────────────────
const ConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}> = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="py-4 text-sm text-base-content/70">{message}</p>
        <div className="modal-action">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm btn-error" onClick={() => { onConfirm(); onClose(); }}>Delete</button>
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

// ═════════════════════════════════════════════════════════════
// ─── MAIN TASK MANAGER COMPONENT ────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function TaskManager() {
  const { user, profile } = useAuth();

  // State
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [subTasks, setSubTasks] = useState<Record<string, SubTaskDoc[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnModalListId, setColumnModalListId] = useState<string | null>(null);

  // Permissions — all authenticated users can manage tasks
  const canEdit = !!user;
  const canAddTasks = !!user;
  const canDelete = !!user;
  const canChangeStatus = !!user;

  // ─── Firestore: Listen for tasks ────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const q = query(
      collection(db, 'tasks'),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const items: TaskDoc[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as TaskDoc[];
      setTasks(items);
      setLoading(false);

      // Subscribe to subtasks for each list task
      items.filter(t => t.type === 'list').forEach(list => {
        const subQ = query(
          collection(db, 'tasks', list.id, 'subtasks'),
          orderBy('createdAt', 'asc'),
        );
        onSnapshot(subQ, (subSnap) => {
          const subs: SubTaskDoc[] = subSnap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as SubTaskDoc[];
          setSubTasks(prev => ({ ...prev, [list.id]: subs }));
        });
      });
    }, (error) => {
      console.error('Tasks listener error:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const simpleTasks = tasks.filter(t => t.type === 'simple');
  const listTasks = tasks.filter(t => t.type === 'list');

  // ─── CRUD ─────────────────────────────────────────────────
  const createSimpleTask = async () => {
    await addDoc(collection(db, 'tasks'), {
      title: '',
      type: 'simple',
      status: 'todo',
      priority: 'normal',
      deadline: '',
      createdAt: serverTimestamp(),
      createdBy: user!.uid,
    });
  };

  const createListTask = async () => {
    const ref = await addDoc(collection(db, 'tasks'), {
      title: '',
      type: 'list',
      status: 'todo',
      priority: 'normal',
      deadline: '',
      customColumns: [],
      createdAt: serverTimestamp(),
      createdBy: user!.uid,
    });
    setExpandedLists(prev => new Set(prev).add(ref.id));
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
    // Delete subtasks first
    const subSnap = await getDocs(collection(db, 'tasks', taskId, 'subtasks'));
    for (const d of subSnap.docs) {
      await deleteDoc(doc(db, 'tasks', taskId, 'subtasks', d.id));
    }
    await deleteDoc(doc(db, 'tasks', taskId));
  };

  const deleteSubTask = async (listId: string, subId: string) => {
    await deleteDoc(doc(db, 'tasks', listId, 'subtasks', subId));
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

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirm = () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });

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
    <div className="p-3 sm:p-4 md:p-6 bg-base-100 rounded-xl shadow-sm border border-base-200 min-h-[400px] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <LayoutList className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Task Manager
          </h2>
          <p className="text-base-content/60 text-xs sm:text-sm">
            Click on any field to edit inline
          </p>
        </div>
        {canAddTasks && (
          <div className="flex gap-2 flex-wrap w-full sm:w-auto">
            <button onClick={createSimpleTask} className="btn btn-xs sm:btn-sm btn-outline gap-1 sm:gap-2 flex-1 sm:flex-none">
              <CheckSquare className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">+</span> Simple
            </button>
            <button onClick={createListTask} className="btn btn-xs sm:btn-sm btn-primary gap-1 sm:gap-2 flex-1 sm:flex-none">
              <LayoutList className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">+</span> List
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6 items-center bg-base-200/50 p-2 sm:p-3 rounded-lg">
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

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* ===== SIMPLE TASKS ===== */}
          {simpleTasks.length > 0 && (
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <h3 className="font-semibold text-base sm:text-lg">Simple Tasks</h3>
                <span className="badge badge-xs sm:badge-sm badge-ghost">{simpleTasks.length}</span>
              </div>

              <div className="overflow-x-auto border border-base-200 rounded-lg">
                <table className="table table-xs sm:table-sm w-full min-w-[400px]">
                  <thead className="bg-base-200/50">
                    <tr>
                      <th className="w-8 sm:w-10"></th>
                      <th className="min-w-[120px]">Task Name</th>
                      <th className="w-24 sm:w-32 min-w-[96px]">Status</th>
                      <th className="w-32 sm:w-36 min-w-[100px]">Due Date</th>
                      {canDelete && <th className="w-8 sm:w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filterTasks(simpleTasks).map(task => (
                      <tr key={task.id} className="hover group">
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs sm:checkbox-sm checkbox-primary"
                            checked={task.status === 'done'}
                            onChange={() => canChangeStatus && updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })}
                            disabled={!canChangeStatus}
                          />
                        </td>
                        <td>
                          {canEdit ? (
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
                        </td>
                        <td>
                          {canChangeStatus ? (
                            <StatusDropdown value={task.status} onChange={val => updateTask(task.id, { status: val })} />
                          ) : (
                            <span className={`badge badge-sm ${task.status === 'done' ? 'badge-success' : task.status === 'in_progress' ? 'badge-warning' : task.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                              {task.status === 'in_progress' ? 'In Progress' : task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || 'To Do'}
                            </span>
                          )}
                        </td>
                        <td>
                          {canEdit ? (
                            <DatePickerPopover value={task.deadline} onSave={val => updateTask(task.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                          ) : (
                            <span className="text-xs sm:text-sm px-2">{task.deadline ? new Date(task.deadline).toLocaleDateString() : '-'}</span>
                          )}
                        </td>
                        {canDelete && (
                          <td>
                            <button
                              onClick={() => showConfirm('Delete Task', `Are you sure you want to delete "${task.title}"?`, () => deleteTask(task.id))}
                              className="btn btn-ghost btn-xs text-error opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== LIST TASKS ===== */}
          {listTasks.length > 0 && (
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <LayoutList className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" />
                <h3 className="font-semibold text-base sm:text-lg">List Tasks</h3>
                <span className="badge badge-xs sm:badge-sm badge-ghost">{listTasks.length}</span>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {filterTasks(listTasks).map(list => (
                  <div key={list.id} className="border border-base-200 rounded-lg overflow-hidden bg-base-100 shadow-sm">
                    {/* List Header */}
                    <div className="bg-base-200/30 p-2 sm:p-3 border-b border-base-200 overflow-x-auto">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-max">
                        <button onClick={() => toggleListExpand(list.id)} className="btn btn-ghost btn-xs btn-circle flex-shrink-0">
                          {expandedLists.has(list.id) ? <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" /> : <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />}
                        </button>

                        <div className="flex-1 min-w-[100px] sm:min-w-[150px]">
                          {canEdit ? (
                            <EditableCell value={list.title} onSave={val => updateTask(list.id, { title: val })} placeholder="List name..." className="font-semibold text-sm sm:text-base" />
                          ) : (
                            <span className="font-semibold text-sm sm:text-base px-2">{list.title || 'Untitled List'}</span>
                          )}
                        </div>

                        <div className="flex-shrink-0">
                          {canChangeStatus ? (
                            <StatusDropdown value={list.status} onChange={val => updateTask(list.id, { status: val })} />
                          ) : (
                            <span className={`badge badge-xs sm:badge-sm ${list.status === 'done' ? 'badge-success' : list.status === 'in_progress' ? 'badge-warning' : list.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                              {list.status === 'in_progress' ? 'In Progress' : list.status?.charAt(0).toUpperCase() + list.status?.slice(1) || 'To Do'}
                            </span>
                          )}
                        </div>

                        <div className="flex-shrink-0">
                          {canEdit ? (
                            <PriorityDropdown value={list.priority} onChange={val => updateTask(list.id, { priority: val })} />
                          ) : (
                            <span className={`badge badge-sm ${list.priority === 'urgent' ? 'text-error bg-error/10' : list.priority === 'high' ? 'text-warning bg-warning/10' : list.priority === 'low' ? 'text-success bg-success/10' : 'text-info bg-info/10'}`}>
                              {list.priority?.charAt(0).toUpperCase() + list.priority?.slice(1) || 'Normal'}
                            </span>
                          )}
                        </div>

                        <div className="flex-shrink-0">
                          {canEdit ? (
                            <DatePickerPopover value={list.deadline} onSave={val => updateTask(list.id, { deadline: val })} placeholder="Due date" className="text-xs" />
                          ) : (
                            <span className="text-xs px-2">{list.deadline ? new Date(list.deadline).toLocaleDateString() : '-'}</span>
                          )}
                        </div>

                        {canDelete && (
                          <button
                            onClick={() => showConfirm('Delete List', `Are you sure you want to delete "${list.title}" and all its subtasks?`, () => deleteTask(list.id))}
                            className="btn btn-ghost btn-xs text-error flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Subtasks Table */}
                    {expandedLists.has(list.id) && (
                      <div className="p-2 bg-base-100 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="table table-xs w-full min-w-[600px]">
                            <thead>
                              <tr className="text-xs text-base-content/50">
                                <th className="w-8"></th>
                                <th className="min-w-[120px]">Subtask</th>
                                <th className="w-24 min-w-[96px]">Status</th>
                                <th className="w-24 min-w-[96px]">Priority</th>
                                <th className="w-28 min-w-[112px]">Due Date</th>
                                {(list.customColumns || []).map(col => (
                                  <th key={col.id} className="w-28 min-w-[112px]">
                                    {canEdit ? (
                                      <ColumnHeader
                                        column={col}
                                        onSave={newName => updateCustomColumnName(list.id, col.id, newName)}
                                        onDelete={() => showConfirm('Delete Column', `Are you sure you want to delete the "${col.name}" column? All data in this column will be lost.`, () => deleteCustomColumn(list.id, col.id))}
                                      />
                                    ) : (
                                      <span>{col.name}</span>
                                    )}
                                  </th>
                                ))}
                                {canEdit && (
                                  <th className="w-10">
                                    <button onClick={() => openColumnModal(list.id)} className="btn btn-ghost btn-xs btn-circle text-primary hover:bg-primary/10" title="Add custom column">
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </th>
                                )}
                                {canEdit && <th className="w-8"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {(subTasks[list.id] || []).map(sub => (
                                <tr key={sub.id} className="hover group">
                                  <td>
                                    <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={sub.status === 'done'} onChange={() => canChangeStatus && updateSubTask(list.id, sub.id, { status: sub.status === 'done' ? 'todo' : 'done' })} disabled={!canChangeStatus} />
                                  </td>
                                  <td>
                                    {canEdit ? (
                                      <EditableCell value={sub.title} onSave={val => updateSubTask(list.id, sub.id, { title: val })} placeholder="Subtask name..." className={`text-sm ${sub.status === 'done' ? 'line-through opacity-50' : ''}`} />
                                    ) : (
                                      <span className={`text-sm px-2 ${sub.status === 'done' ? 'line-through opacity-50' : ''}`}>{sub.title || 'Untitled Subtask'}</span>
                                    )}
                                  </td>
                                  <td>
                                    {canChangeStatus ? (
                                      <StatusDropdown value={sub.status} onChange={val => updateSubTask(list.id, sub.id, { status: val })} />
                                    ) : (
                                      <span className={`badge badge-sm ${sub.status === 'done' ? 'badge-success' : sub.status === 'in_progress' ? 'badge-warning' : sub.status === 'review' ? 'badge-info' : 'badge-ghost'}`}>
                                        {sub.status === 'in_progress' ? 'In Progress' : sub.status?.charAt(0).toUpperCase() + sub.status?.slice(1) || 'To Do'}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {canEdit ? (
                                      <PriorityDropdown value={sub.priority} onChange={val => updateSubTask(list.id, sub.id, { priority: val })} />
                                    ) : (
                                      <span className={`badge badge-sm ${sub.priority === 'urgent' ? 'text-error bg-error/10' : sub.priority === 'high' ? 'text-warning bg-warning/10' : sub.priority === 'low' ? 'text-success bg-success/10' : 'text-info bg-info/10'}`}>
                                        {sub.priority?.charAt(0).toUpperCase() + sub.priority?.slice(1) || 'Normal'}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {canEdit ? (
                                      <DatePickerPopover value={sub.deadline} onSave={val => updateSubTask(list.id, sub.id, { deadline: val })} placeholder="Set date" className="text-xs" />
                                    ) : (
                                      <span className="text-xs px-2">{sub.deadline ? new Date(sub.deadline).toLocaleDateString() : '-'}</span>
                                    )}
                                  </td>
                                  {(list.customColumns || []).map(col => (
                                    <td key={col.id}>
                                      {canEdit ? (
                                        <CustomFieldCell column={col} value={sub.customFields?.[col.id]} onSave={val => updateSubTaskCustomField(list.id, sub.id, col.id, val)} />
                                      ) : (
                                        <span className="text-xs px-2">{sub.customFields?.[col.id] != null ? String(sub.customFields[col.id]) : '-'}</span>
                                      )}
                                    </td>
                                  ))}
                                  {canEdit && <td></td>}
                                  {canDelete && (
                                    <td>
                                      <button onClick={() => showConfirm('Delete Subtask', `Are you sure you want to delete "${sub.title}"?`, () => deleteSubTask(list.id, sub.id))} className="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {canAddTasks && (
                          <button onClick={() => createSubTask(list.id)} className="btn btn-ghost btn-xs w-full mt-2 text-primary border-dashed border border-base-300 hover:border-primary">
                            <Plus className="w-3 h-3" /> Add Subtask
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {simpleTasks.length === 0 && listTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-base-content/50">
              <LayoutList className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">No tasks yet</p>
              <p className="text-sm">
                {canAddTasks ? 'Click "+ Simple" or "+ List" to get started' : 'No tasks have been created yet'}
              </p>
            </div>
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
      />
    </div>
  );
}
