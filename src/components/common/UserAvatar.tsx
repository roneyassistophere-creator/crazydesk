'use client';

import { useState } from 'react';
import { User as UserIcon } from 'lucide-react';

interface UserAvatarProps {
  photoURL?: string | null;
  displayName?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showRing?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-24 h-24',
  xl: 'w-32 h-32',
};

const iconSizes: Record<string, number> = {
  xs: 12,
  sm: 16,
  md: 24,
  lg: 48,
  xl: 64,
};

const textSizes: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
};

export default function UserAvatar({ 
  photoURL, 
  displayName, 
  size = 'md', 
  className = '',
  showRing = true 
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = displayName?.[0]?.toUpperCase() || '?';
  const hasValidPhoto = photoURL && !imgFailed;
  
  return (
    <div className={`avatar placeholder ${className}`}>
      <div className={`${sizeClasses[size]} rounded-full ${showRing ? 'ring ring-primary ring-offset-base-100 ring-offset-2' : ''} overflow-hidden bg-neutral text-neutral-content flex items-center justify-center relative`}>
        {hasValidPhoto ? (
          <img 
            src={photoURL!}
            alt={displayName || 'User'} 
            className="object-cover w-full h-full absolute inset-0 z-10"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : null}
        {/* Fallback: always rendered behind the image */}
        <span className={`${textSizes[size]} font-bold`}>
          {displayName ? initials : <UserIcon size={iconSizes[size]} />}
        </span>
      </div>
    </div>
  );
}
