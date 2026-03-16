'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  icon?: React.ReactNode;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  icon,
}: ConfirmationModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-base-content/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-base-100 rounded-2xl shadow-2xl border border-base-300 w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        {/* Top accent bar */}
        <div className={`h-1 w-full ${isDanger ? 'bg-error' : 'bg-warning'}`} />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className={`p-2.5 rounded-xl shrink-0 ${isDanger ? 'bg-error/10' : 'bg-warning/10'}`}>
              {icon || <AlertTriangle className={`w-5 h-5 ${isDanger ? 'text-error' : 'text-warning'}`} />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm uppercase tracking-wide">{title}</h3>
              <p className="text-xs text-base-content/50 mt-1.5 leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-square shrink-0 -mt-1 -mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              ref={cancelRef}
              onClick={onClose}
              className="btn btn-ghost btn-sm text-[10px] font-bold uppercase tracking-widest px-5"
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className={`btn btn-sm text-[10px] font-bold uppercase tracking-widest px-5 ${isDanger ? 'btn-error' : 'btn-warning'}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
