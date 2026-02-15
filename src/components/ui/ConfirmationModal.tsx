'use client';
import { Fragment } from 'react';
import { AlertCircle, CheckCircle, Trash2 } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  type?: 'danger' | 'success' | 'warning';
  confirmText?: string;
  cancelText?: string;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText = 'Confirm',
  cancelText = 'Cancel'
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box relative">
        <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            type === 'danger' ? 'bg-error/10 text-error' :
            type === 'success' ? 'bg-success/10 text-success' :
            'bg-warning/10 text-warning'
          }`}>
            {type === 'danger' ? <Trash2 size={32} /> :
             type === 'success' ? <CheckCircle size={32} /> :
             <AlertCircle size={32} />
            }
          </div>
          
          <h3 className="font-bold text-xl">{title}</h3>
          <p className="text-base-content/70">{message}</p>
          
          <div className="modal-action w-full justify-center gap-2 mt-4">
            <button className="btn btn-ghost" onClick={onClose}>
              {cancelText}
            </button>
            <button 
              className={`btn ${
                type === 'danger' ? 'btn-error' :
                type === 'success' ? 'btn-success' :
                'btn-warning'
              }`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
      <div className="modal-backdrop bg-base-300/50" onClick={onClose}></div>
    </div>
  );
}
