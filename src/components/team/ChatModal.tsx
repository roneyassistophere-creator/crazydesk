'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  collection, addDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, Timestamp, or,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import UserAvatar from '@/components/common/UserAvatar';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  receiverId: string;
  text: string;
  createdAt: Timestamp | null;
}

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: {
    uid: string;
    displayName: string;
    photoURL?: string;
  } | null;
}

export default function ChatModal({ isOpen, onClose, targetUser }: ChatModalProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate a consistent conversation ID for 2 users
  const getConversationPair = useCallback(() => {
    if (!user || !targetUser) return null;
    const ids = [user.uid, targetUser.uid].sort();
    return ids;
  }, [user, targetUser]);

  // Listen to messages
  useEffect(() => {
    if (!isOpen || !user || !targetUser) return;

    setLoadingMsgs(true);
    const pair = getConversationPair();
    if (!pair) return;

    // Query messages between these two users
    const q = query(
      collection(db, 'chat_messages'),
      where('participants', '==', pair),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      setMessages(msgs);
      setLoadingMsgs(false);
    }, (err) => {
      console.error('Chat messages error:', err);
      setLoadingMsgs(false);
    });

    return () => unsub();
  }, [isOpen, user, targetUser, getConversationPair]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !targetUser || sending) return;
    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const pair = getConversationPair();
      await addDoc(collection(db, 'chat_messages'), {
        senderId: user.uid,
        senderName: profile?.displayName || 'User',
        senderPhoto: profile?.photoURL || '',
        receiverId: targetUser.uid,
        text,
        participants: pair,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setNewMessage(text); // Restore on error
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen || !targetUser) return null;

  const formatTime = (ts: Timestamp | null) => {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg h-[70vh] flex flex-col border border-base-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-200 bg-base-200/50 shrink-0">
          <UserAvatar
            photoURL={targetUser.photoURL}
            displayName={targetUser.displayName}
            size="sm"
            showRing={false}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base-content truncate">{targetUser.displayName}</h3>
            <p className="text-xs text-base-content/50">Direct Message</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loadingMsgs ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-base-content/40 gap-2">
              <Send className="w-8 h-8" />
              <p className="text-sm italic">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user?.uid;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] ${isMe ? 'order-1' : 'order-1'}`}>
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? 'bg-primary text-primary-content rounded-br-md'
                          : 'bg-base-200 text-base-content rounded-bl-md'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <div className={`text-[10px] text-base-content/40 mt-1 px-1 ${isMe ? 'text-right' : 'text-left'}`}>
                      {formatTime(msg.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-base-200 bg-base-100 shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="input input-bordered flex-1 input-sm"
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="btn btn-primary btn-sm btn-circle"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
