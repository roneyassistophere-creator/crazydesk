'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { 
  Globe, User, Smartphone, Bot, CheckCircle2, 
  Plus, X, ChevronRight, ChevronLeft, Trash2,
  Layout, Target, Flag, Settings2, Check, Search, 
  Archive, RotateCcw, BookOpen, Sparkles, Map
} from 'lucide-react';
import ConfirmationModal from '@/components/common/ConfirmationModal';

interface SubTask {
  id: string | number;
  text: string;
  completed: boolean;
}

interface Milestone {
  id: string;
  label: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: string;
  dueDate: string;
  desc: string;
  checklist: SubTask[];
  roadmapId?: string;
}

interface Roadmap {
  id: string;
  title: string;
  agenda: string;
  icon: string;
  theme: string;
  milestones: Milestone[];
}

const ROADMAPS_LOCAL_KEY = 'crazydesk_roadmaps';
const ARCHIVED_ROADMAPS_LOCAL_KEY = 'crazydesk_archived_roadmaps';
const ROADMAPS_BACKUP_LOCAL_KEY = 'crazydesk_roadmaps_backup';
const ARCHIVED_ROADMAPS_BACKUP_LOCAL_KEY = 'crazydesk_archived_roadmaps_backup';
const ROADMAPS_INITIAL_BACKUP_LOCAL_KEY = 'crazydesk_roadmaps_backup_initial';
const ARCHIVED_ROADMAPS_INITIAL_BACKUP_LOCAL_KEY = 'crazydesk_archived_roadmaps_backup_initial';
const SHARED_ROADMAP_DOC = doc(db, 'shared_data', 'roadmaps_v1');

const getDefaultRoadmaps = (): Roadmap[] => [
  {
    id: 'road-website-success',
    title: 'Website Success',
    agenda: 'Execution roadmap for website build, SEO growth, lead capture, and expansion.',
    icon: 'Globe',
    theme: 'primary',
    milestones: [
      {
        id: 'm-foundation',
        label: 'Foundation',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Core website setup and base architecture.',
        checklist: [
          { id: 'f-1', text: 'Make the admin Dashboard Ready', completed: false },
          { id: 'f-2', text: 'Make the Client Side Ready', completed: false },
          { id: 'f-3', text: 'Make Master Template for new pages', completed: false },
          { id: 'f-4', text: 'Make Template For Location Pages', completed: false },
          { id: 'f-5', text: 'Make the Final Menu and Their Sub Pages', completed: false },
          { id: 'f-6', text: 'Make the blogging System', completed: false }
        ]
      },
      {
        id: 'm-design-aesthetics',
        label: 'DESIGN & ASTHETICS',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Visual and UX upgrades.',
        checklist: [
          { id: 'da-1', text: 'Add smart header', completed: false },
          { id: 'da-2', text: 'Add smart Footer', completed: false },
          { id: 'da-3', text: 'Add theme toggle', completed: false },
          { id: 'da-4', text: 'Light Mode and Dark Mode', completed: false },
          { id: 'da-5', text: 'Ask Tasin and Rajib For Images', completed: false }
        ]
      },
      {
        id: 'm-technical-seo',
        label: 'TECHNICAL SEO',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Tracking, indexing, and performance basics.',
        checklist: [
          { id: 'ts-1', text: 'Connect Google Analytics', completed: false },
          { id: 'ts-2', text: 'Connect Search Console', completed: false },
          { id: 'ts-3', text: 'Submit Sitemap', completed: false },
          { id: 'ts-4', text: 'Optimize Speed and Caching', completed: false }
        ]
      },
      {
        id: 'm-pillar-building',
        label: 'PILLAR PAGE BUILDING',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Pillar pages, blogs, and keyword mapping workflow.',
        checklist: [
          { id: 'pp-1', text: 'Page formats and Framework Decide', completed: false },
          { id: 'pp-2', text: 'Design All Pilar Pages', completed: false },
          { id: 'pp-3', text: 'Write 5-10 blogs', completed: false },
          { id: 'pp-4', text: 'Internal Linking With The pages', completed: false },
          { id: 'pp-5', text: 'Copy Contents from wordpress', completed: false },
          { id: 'pp-6', text: 'Add Trust Pilot Reviews', completed: false },
          { id: 'pp-7', text: 'Add Pillar page for digital Services to services', completed: false },
          { id: 'pp-8', text: 'Map the keywords while designing', completed: false }
        ]
      },
      {
        id: 'm-offers-cta',
        label: 'OFFERS, CTA & LEAD CAPTURES',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Conversion and lead generation system.',
        checklist: [
          { id: 'oc-1', text: 'Design Pricing Packages', completed: false },
          { id: 'oc-2', text: 'Design Clear Messages', completed: false },
          { id: 'oc-3', text: 'Add Estimation Calculator with CMS', completed: false },
          { id: 'oc-4', text: 'Downloadable Resources with CMS', completed: false },
          { id: 'oc-5', text: 'Contact Forms with CMS', completed: false },
          { id: 'oc-6', text: 'Get Quote with CMS', completed: false },
          { id: 'oc-7', text: 'Add enough CTA for Calling and Whatsapp', completed: false },
          { id: 'oc-8', text: 'Add a live chat , starts with email, says no one available', completed: false },
          { id: 'oc-9', text: 'Newsletter subscription option with CMS', completed: false },
          { id: 'oc-10', text: 'Roi Calculator', completed: false },
          { id: 'oc-11', text: 'Add a pop up for regular tips and tricks', completed: false }
        ]
      },
      {
        id: 'm-build-subpages',
        label: 'BUILD SUB PAGES',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Scalable page creation with SEO-first structure.',
        checklist: [
          { id: 'bs-1', text: 'Design Services Subpages', completed: false },
          { id: 'bs-2', text: 'Design Location subpages (one template)', completed: false },
          { id: 'bs-3', text: 'Design Footer Sub Pages', completed: false },
          { id: 'bs-4', text: 'Make Sure things are SEO optimized while designing', completed: false }
        ]
      },
      {
        id: 'm-onpage-seo',
        label: 'ON PAGE SEO',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Content and metadata quality standards.',
        checklist: [
          { id: 'op-1', text: 'Meta Title Meta description', completed: false },
          { id: 'op-2', text: 'Image tags are all good', completed: false },
          { id: 'op-3', text: 'Internal and External linking', completed: false },
          { id: 'op-4', text: 'EEAT maintained', completed: false },
          { id: 'op-5', text: 'Topic Authority dominated', completed: false }
        ]
      },
      {
        id: 'm-backlink-building',
        label: 'Backlink Building',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Authority and outreach execution.',
        checklist: [
          { id: 'bb-1', text: 'Create Social Accounts', completed: false },
          { id: 'bb-2', text: 'Get latest High DA accounts', completed: false },
          { id: 'bb-3', text: 'Guest Posting to forums and other platforms', completed: false },
          { id: 'bb-4', text: 'Outreach For Backlinks from compititors', completed: false },
          { id: 'bb-5', text: 'HARO and COMMUNITY outreach', completed: false },
          { id: 'bb-6', text: 'Step...', completed: false }
        ]
      },
      {
        id: 'm-ai-visibility',
        label: 'AI VISIBILITY OPT.',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'AI discoverability and AI-search targeting.',
        checklist: [
          { id: 'ai-1', text: 'Make sure AI can crawl', completed: false },
          { id: 'ai-2', text: 'Ai friendly contents are added', completed: false },
          { id: 'ai-3', text: 'Ai friendly Long tails are targeted', completed: false }
        ]
      },
      {
        id: 'm-expansion',
        label: 'EXPANSION',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'New roadmap branches and service expansion.',
        checklist: [
          { id: 'ex-1', text: 'Add connected pages', completed: false },
          { id: 'ex-2', text: 'Designing the Airbnb Roadmap pages', completed: false },
          { id: 'ex-3', text: 'Design the learning flow for entering Airbnb', completed: false },
          { id: 'ex-4', text: 'Provide resources and information through pages and blogs', completed: false },
          { id: 'ex-5', text: 'Add service cards and create pages for each.', completed: false }
        ]
      },
      {
        id: 'm-final-audit',
        label: 'FINAL WEBSITE AUDIT and REVIEW',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Final verification and quality review before scale.',
        checklist: []
      }
    ]
  },
  {
    id: 'road-rafin-branding',
    title: 'RAFIN - BRANDING',
    agenda: 'Brand visibility and personal content engine for outreach.',
    icon: 'Sparkles',
    theme: 'secondary',
    milestones: [
      {
        id: 'rb-warm-up',
        label: 'WARM UP',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Initial content and audience warmup activities.',
        checklist: [
          { id: 'rb-1', text: 'Create Dedicated Tiktok, Facebook, Insta and Youtube.', completed: false },
          { id: 'rb-2', text: 'Create a very basic 30 seconds of talking video about morning coffee and a little walk around your area talking about starting the day and post it to all these platforms.', completed: false },
          { id: 'rb-3', text: 'Create a video talking about a bad day seeing your property after the guests left.', completed: false },
          { id: 'rb-4', text: 'Create a 40 second video on your Airbnb property inspection after a guest left.', completed: false },
          { id: 'rb-5', text: 'Create a 25 sec video: ask for suggestions about any of your airbnb concerns like what would you do in this situation as a airbnb host?', completed: false },
          { id: 'rb-6', text: 'Capture 10 pictures for sharing to stories.', completed: false }
        ]
      }
    ]
  },
  {
    id: 'road-contents-assistosphere',
    title: 'CONTENTS - ASSISTOPHERE',
    agenda: 'Content funnel for authority and lead conversion.',
    icon: 'BookOpen',
    theme: 'accent',
    milestones: [
      {
        id: 'ca-foundation',
        label: 'FOUNDATION',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Core intro and educational video sequence.',
        checklist: [
          { id: 'ca-f-1', text: 'Create a short video about team intro, each member comes up and tells i do this to solve your this.', completed: false },
          { id: 'ca-f-2', text: 'Create a funny reels about each team member showcasing who is like which animal.', completed: false },
          { id: 'ca-f-3', text: 'A welcome video that explains assistophere: How X is airbnb host, faced this this problems, about to quit airbnb, assistophere comes in to solve all their problems and get things up and ready again.', completed: false },
          { id: 'ca-f-4', text: 'Create 15 photos for sharing to story. Premade.', completed: false }
        ]
      },
      {
        id: 'ca-middle-funnel',
        label: 'MIDDLE FUNNEL',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Comparison, proof, and hook-based content.',
        checklist: [
          { id: 'ca-m-1', text: 'Compare 4 good and bad listing in 40 seconds. 5 key points.', completed: false },
          { id: 'ca-m-2', text: 'Share 3 results that you got by doing specific 5 things to the listing.', completed: false },
          { id: 'ca-m-3', text: 'Hook: Can you imagine getting a 1 year long booking on my clients property, litterally hassle free year.', completed: false },
          { id: 'ca-m-4', text: 'To make your airbnb business profitable you need 3 things: For our comprehensive guide dm or comment', completed: false },
          { id: 'ca-m-5', text: 'Why fast reply is the key to success.', completed: false }
        ]
      },
      {
        id: 'ca-bottom-funnel',
        label: 'BOTTOM FUNNEL',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Direct conversion-focused offers and calls.',
        checklist: [
          { id: 'ca-b-1', text: 'You just need a 5 page guide to make your airbnb profitable. Collect Emails in exchange of data.', completed: false },
          { id: 'ca-b-2', text: 'Promote a live webinar about pricing optimization.', completed: false },
          { id: 'ca-b-3', text: 'Direct call to action video saying if you need someone to manage your airbnb just call us.', completed: false }
        ]
      }
    ]
  },
  {
    id: 'road-community-reach',
    title: 'COMMUNITY REACH',
    agenda: 'Community participation and trust-building channels.',
    icon: 'User',
    theme: 'info',
    milestones: [
      {
        id: 'cr-follow-ups',
        label: 'FOLLOW UPS',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Presence in groups and forums.',
        checklist: [
          { id: 'cr-f-1', text: 'Join whatsapp groups', completed: false },
          { id: 'cr-f-2', text: 'Join related facebook groups', completed: false },
          { id: 'cr-f-3', text: 'Join 3 very active forums', completed: false }
        ]
      },
      {
        id: 'cr-social-connection',
        label: 'SOCIAL CONNECTION',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Add and connect with target hosts.',
        checklist: [
          { id: 'cr-s-1', text: 'Find 5 new hosts on tiktok', completed: false },
          { id: 'cr-s-2', text: 'Find 5 new Hosts On Linked In', completed: false },
          { id: 'cr-s-3', text: 'Find 5 new Hosts On Facebook', completed: false }
        ]
      },
      {
        id: 'cr-marketplace',
        label: 'MARKETPLACE',
        status: 'todo',
        priority: 'Low',
        dueDate: '',
        desc: 'Marketplace profile and listing channels.',
        checklist: [
          { id: 'cr-m-1', text: 'Fiver', completed: false },
          { id: 'cr-m-2', text: 'Upwork', completed: false },
          { id: 'cr-m-3', text: 'Freelancer.com', completed: false },
          { id: 'cr-m-4', text: 'Bruntwork', completed: false }
        ]
      },
      {
        id: 'cr-rajib-roney-branding',
        label: 'RAJIB/RONEY BRANDING',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Personal branding videos and profile touch-ups.',
        checklist: [
          { id: 'cr-r-1', text: 'Personal profiles will have a property touch ups', completed: false },
          { id: 'cr-r-2', text: 'Make simple videos related to things we do', completed: false },
          { id: 'cr-r-3', text: 'Make sure when we use personal profiles to talk to someone its appears legit and related', completed: false }
        ]
      }
    ]
  },
  {
    id: 'road-email-marketing',
    title: 'EMAIL MARKETING',
    agenda: 'Lead hunting, offer messaging, and email automation.',
    icon: 'Smartphone',
    theme: 'secondary',
    milestones: [
      {
        id: 'em-lead-generation',
        label: 'LEAD GENERATION',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Lead source setup and outbound readiness.',
        checklist: [
          { id: 'em-l-1', text: 'Setup a lead hunting page for preparing lead sheet. so no emails repeats.', completed: false },
          { id: 'em-l-2', text: 'Find emails from UK company directory', completed: false },
          { id: 'em-l-3', text: 'Find properties from google maps and collect contacts', completed: false },
          { id: 'em-l-4', text: 'Find an way to scrap data from airbnb via apify', completed: false },
          { id: 'em-l-5', text: 'Try out fiver guys for bulk data and send nail', completed: false },
          { id: 'em-l-6', text: 'Run video Ads to get emails or numbers or dms', completed: false },
          { id: 'em-l-7', text: 'A video saying, get unlimited direct bookings, then fills up a form to check if he can get direct bookings from us.', completed: false }
        ]
      },
      {
        id: 'em-offer-message',
        label: 'OFFER - MESSAGE',
        status: 'todo',
        priority: 'High',
        dueDate: '',
        desc: 'Offer structure and response messaging.',
        checklist: [
          { id: 'em-o-1', text: 'Design the initial message', completed: false },
          { id: 'em-o-2', text: 'Design the offer: full airbnb mngmnt , less then a cleaning fee', completed: false },
          { id: 'em-o-3', text: 'Follow up strategy replys', completed: false },
          { id: 'em-o-4', text: 'Design a email template with signature and proof', completed: false }
        ]
      },
      {
        id: 'em-automation',
        label: 'EMAIL AUTOMATION',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Automation stack for follow-up and nurturing.',
        checklist: [
          { id: 'em-a-1', text: 'buy required domain', completed: false },
          { id: 'em-a-2', text: 'setup mailchimp or other platform', completed: false },
          { id: 'em-a-3', text: 'use lead sheet to email and follow up', completed: false },
          { id: 'em-a-4', text: 'use ai in further automation', completed: false }
        ]
      },
      {
        id: 'em-personal-emails',
        label: 'PERSONAL EMAILS',
        status: 'todo',
        priority: 'Medium',
        dueDate: '',
        desc: 'Personalized campaign for higher response rate.',
        checklist: [
          { id: 'em-p-1', text: 'Setup a personal email campaign', completed: false },
          { id: 'em-p-2', text: 'Inbox people personaly for managing their properties. Higher response rate', completed: false }
        ]
      }
    ]
  },
  {
    id: 'road-systemization',
    title: 'SYSTEMIZATION',
    agenda: 'Operations, accountability, documentation, and automation framework.',
    icon: 'Settings2',
    theme: 'neutral',
    milestones: [
      { id: 'sy-foundation', label: 'FOUNDATION', status: 'todo', priority: 'High', dueDate: '', desc: 'System foundation.', checklist: [] },
      { id: 'sy-team-management', label: 'TEAM MANAGEMENT', status: 'todo', priority: 'High', dueDate: '', desc: 'Team operations structure.', checklist: [] },
      { id: 'sy-client-satisfaction', label: 'CLIENT SATISFACTION', status: 'todo', priority: 'High', dueDate: '', desc: 'Client outcome checks.', checklist: [] },
      { id: 'sy-team-efficiency', label: 'TEAM EFFICIENCY', status: 'todo', priority: 'Medium', dueDate: '', desc: 'Execution efficiency improvements.', checklist: [] },
      { id: 'sy-ensure-task', label: 'ENSURE TASK COMPLITION', status: 'todo', priority: 'High', dueDate: '', desc: 'Task completion controls.', checklist: [] },
      { id: 'sy-accountability', label: 'ACCOUNTABILITY & REPORTING', status: 'todo', priority: 'High', dueDate: '', desc: 'Reporting and ownership.', checklist: [] },
      { id: 'sy-documentation', label: 'DOCUMENTATION', status: 'todo', priority: 'Medium', dueDate: '', desc: 'Documentation system.', checklist: [] },
      { id: 'sy-knowledge-base', label: 'KNOWLEDGE BASE', status: 'todo', priority: 'Medium', dueDate: '', desc: 'Knowledge repository.', checklist: [] },
      { id: 'sy-recruitment', label: 'RECRUITMENT AND TRAINNING DOCS', status: 'todo', priority: 'Medium', dueDate: '', desc: 'Hiring and training docs.', checklist: [] },
      { id: 'sy-cutting', label: 'CUTTING OF THINGS', status: 'todo', priority: 'Low', dueDate: '', desc: 'Remove unnecessary process overhead.', checklist: [] },
      { id: 'sy-task-automation', label: 'TASK AUTOMATION', status: 'todo', priority: 'Medium', dueDate: '', desc: 'Automate repetitive tasks.', checklist: [] },
      { id: 'sy-ai-integration', label: 'AI INTEGRATION', status: 'todo', priority: 'Medium', dueDate: '', desc: 'AI augmentation in workflows.', checklist: [] }
    ]
  }
];

const parseRoadmaps = (raw: string | null): Roadmap[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readLegacyLocalRoadmaps = () => {
  if (typeof window === 'undefined') {
    return { roadmaps: [] as Roadmap[], archivedRoadmaps: [] as Roadmap[] };
  }

  const active = parseRoadmaps(localStorage.getItem(ROADMAPS_LOCAL_KEY));
  const archived = parseRoadmaps(localStorage.getItem(ARCHIVED_ROADMAPS_LOCAL_KEY));

  return { roadmaps: active, archivedRoadmaps: archived };
};

const persistLocalBackup = (roadmaps: Roadmap[], archivedRoadmaps: Roadmap[]) => {
  if (typeof window === 'undefined') return;

  localStorage.setItem(ROADMAPS_BACKUP_LOCAL_KEY, JSON.stringify(roadmaps));
  localStorage.setItem(ARCHIVED_ROADMAPS_BACKUP_LOCAL_KEY, JSON.stringify(archivedRoadmaps));
  localStorage.setItem(ROADMAPS_LOCAL_KEY, JSON.stringify(roadmaps));
  localStorage.setItem(ARCHIVED_ROADMAPS_LOCAL_KEY, JSON.stringify(archivedRoadmaps));
};

const persistInitialLocalBackup = (roadmaps: Roadmap[], archivedRoadmaps: Roadmap[]) => {
  if (typeof window === 'undefined') return;

  if (!localStorage.getItem(ROADMAPS_INITIAL_BACKUP_LOCAL_KEY)) {
    localStorage.setItem(ROADMAPS_INITIAL_BACKUP_LOCAL_KEY, JSON.stringify(roadmaps));
  }

  if (!localStorage.getItem(ARCHIVED_ROADMAPS_INITIAL_BACKUP_LOCAL_KEY)) {
    localStorage.setItem(ARCHIVED_ROADMAPS_INITIAL_BACKUP_LOCAL_KEY, JSON.stringify(archivedRoadmaps));
  }
};

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = { Globe, User, Smartphone, Bot, Layout, Settings2, Target, Sparkles, BookOpen, Map };

const getIcon = (name: string) => {
  const IconComponent = iconMap[name] || Layout;
  return <IconComponent className="w-3.5 h-3.5" />;
};

export default function RoadmapPage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [archivedRoadmaps, setArchivedRoadmaps] = useState<Roadmap[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const latestSyncedPayloadRef = useRef('');

  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState<(Milestone & { roadmapId: string }) | null>(null);
  const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string; type: 'roadmap' | 'milestone'; roadmapId?: string } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile && profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
      router.push('/dashboard');
    }
  }, [profile, router]);

  useEffect(() => {
    if (!user || !profile || (profile.role !== 'ADMIN' && profile.role !== 'MANAGER')) {
      setRoadmaps([]);
      setArchivedRoadmaps([]);
      setIsHydrated(false);
      latestSyncedPayloadRef.current = '';
      return;
    }

    const legacyStateAtLogin = readLegacyLocalRoadmaps();
    persistInitialLocalBackup(legacyStateAtLogin.roadmaps, legacyStateAtLogin.archivedRoadmaps);

    const unsubscribe = onSnapshot(SHARED_ROADMAP_DOC, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const nextRoadmaps = Array.isArray(data.roadmaps) ? (data.roadmaps as Roadmap[]) : [];
        const nextArchivedRoadmaps = Array.isArray(data.archivedRoadmaps) ? (data.archivedRoadmaps as Roadmap[]) : [];

        const templateRoadmaps = getDefaultRoadmaps();
        const existingRoadmapIds = new Set(nextRoadmaps.map((roadmap) => roadmap.id));
        const missingTemplateRoadmaps = templateRoadmaps.filter((roadmap) => !existingRoadmapIds.has(roadmap.id));

        if (missingTemplateRoadmaps.length > 0 && (nextRoadmaps.length > 0 || nextArchivedRoadmaps.length > 0)) {
          const mergedRoadmaps = [...nextRoadmaps, ...missingTemplateRoadmaps];
          const mergedPayload = JSON.stringify({ roadmaps: mergedRoadmaps, archivedRoadmaps: nextArchivedRoadmaps });
          latestSyncedPayloadRef.current = mergedPayload;

          setRoadmaps(mergedRoadmaps);
          setArchivedRoadmaps(nextArchivedRoadmaps);
          persistLocalBackup(mergedRoadmaps, nextArchivedRoadmaps);
          setIsHydrated(true);

          await setDoc(SHARED_ROADMAP_DOC, {
            roadmaps: mergedRoadmaps,
            archivedRoadmaps: nextArchivedRoadmaps,
            templateSyncedAt: serverTimestamp(),
            templateSyncedBy: user.uid,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
          }, { merge: true });
          return;
        }

        if (nextRoadmaps.length === 0 && nextArchivedRoadmaps.length === 0) {
          const seededRoadmaps = getDefaultRoadmaps();
          const seededArchivedRoadmaps: Roadmap[] = [];
          const seededPayload = JSON.stringify({ roadmaps: seededRoadmaps, archivedRoadmaps: seededArchivedRoadmaps });
          latestSyncedPayloadRef.current = seededPayload;

          setRoadmaps(seededRoadmaps);
          setArchivedRoadmaps(seededArchivedRoadmaps);
          persistLocalBackup(seededRoadmaps, seededArchivedRoadmaps);
          setIsHydrated(true);

          await setDoc(SHARED_ROADMAP_DOC, {
            roadmaps: seededRoadmaps,
            archivedRoadmaps: seededArchivedRoadmaps,
            seededAt: serverTimestamp(),
            seededBy: user.uid,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
          }, { merge: true });
          return;
        }

        const payload = JSON.stringify({ roadmaps: nextRoadmaps, archivedRoadmaps: nextArchivedRoadmaps });
        latestSyncedPayloadRef.current = payload;

        setRoadmaps(nextRoadmaps);
        setArchivedRoadmaps(nextArchivedRoadmaps);
        persistLocalBackup(nextRoadmaps, nextArchivedRoadmaps);
        setIsHydrated(true);
        return;
      }

      const localState = readLegacyLocalRoadmaps();
      const initialRoadmaps = localState.roadmaps.length > 0 ? localState.roadmaps : getDefaultRoadmaps();
      const initialArchivedRoadmaps = localState.archivedRoadmaps;
      const payload = JSON.stringify({ roadmaps: initialRoadmaps, archivedRoadmaps: initialArchivedRoadmaps });
      latestSyncedPayloadRef.current = payload;

      setRoadmaps(initialRoadmaps);
      setArchivedRoadmaps(initialArchivedRoadmaps);
      persistLocalBackup(initialRoadmaps, initialArchivedRoadmaps);
      setIsHydrated(true);

      await setDoc(SHARED_ROADMAP_DOC, {
        roadmaps: initialRoadmaps,
        archivedRoadmaps: initialArchivedRoadmaps,
        migratedAt: serverTimestamp(),
        migratedBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
    });

    return () => unsubscribe();
  }, [profile, user]);

  useEffect(() => {
    if (!user || !isHydrated) return;

    persistLocalBackup(roadmaps, archivedRoadmaps);
    const payload = JSON.stringify({ roadmaps, archivedRoadmaps });

    if (payload === latestSyncedPayloadRef.current) {
      return;
    }

    latestSyncedPayloadRef.current = payload;
    setDoc(SHARED_ROADMAP_DOC, {
      roadmaps,
      archivedRoadmaps,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    }, { merge: true }).catch((error) => {
      console.error('Failed to sync roadmap to Firestore:', error);
      latestSyncedPayloadRef.current = '';
    });
  }, [roadmaps, archivedRoadmaps, isHydrated, user]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const addRoadmap = () => {
    const themes = ['primary', 'secondary', 'accent', 'info'];
    const newRoadmap: Roadmap = {
      id: `road-${Date.now()}`,
      title: 'New Path',
      agenda: '',
      icon: 'Target',
      theme: themes[Math.floor(Math.random() * themes.length)],
      milestones: []
    };
    setRoadmaps([...roadmaps, newRoadmap]);
    setSelectedRoadmap(newRoadmap);
    setSelectedMilestone(null);
    setIsSidebarOpen(true);
    setViewMode('active');
  };

  const deleteRoadmap = (id: string) => {
    if (viewMode === 'active') {
      setRoadmaps(roadmaps.filter(r => r.id !== id));
    } else {
      setArchivedRoadmaps(archivedRoadmaps.filter(r => r.id !== id));
    }
    if (selectedRoadmap?.id === id) setIsSidebarOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'roadmap') {
      deleteRoadmap(deleteConfirm.id);
    } else {
      const deleteFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;
      const currentList = viewMode === 'active' ? roadmaps : archivedRoadmaps;
      deleteFunc(currentList.map(road => road.id === deleteConfirm.roadmapId ? { ...road, milestones: road.milestones.filter(m => m.id !== deleteConfirm.id) } : road));
      setIsSidebarOpen(false);
    }
    setDeleteConfirm(null);
  };

  const archiveRoadmap = (id: string) => {
    const roadmapToArchive = roadmaps.find(r => r.id === id);
    if (roadmapToArchive) {
      setArchivedRoadmaps([roadmapToArchive, ...archivedRoadmaps]);
      setRoadmaps(roadmaps.filter(r => r.id !== id));
      if (selectedRoadmap?.id === id) setIsSidebarOpen(false);
    }
  };

  const restoreRoadmap = (id: string) => {
    const roadmapToRestore = archivedRoadmaps.find(r => r.id === id);
    if (roadmapToRestore) {
      setRoadmaps([roadmapToRestore, ...roadmaps]);
      setArchivedRoadmaps(archivedRoadmaps.filter(r => r.id !== id));
    }
  };

  const addMilestone = (roadmapId: string) => {
    const newId = `m-${Math.random().toString(36).substr(2, 9)}`;
    const newMilestone: Milestone = {
      id: newId,
      label: 'New Point',
      status: 'todo',
      priority: 'Medium',
      dueDate: '',
      desc: '',
      checklist: []
    };
    
    const updateFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;
    const currentList = viewMode === 'active' ? roadmaps : archivedRoadmaps;

    updateFunc(currentList.map(road => 
      road.id === roadmapId ? { ...road, milestones: [...road.milestones, newMilestone] } : road
    ));
    setSelectedMilestone({ ...newMilestone, roadmapId });
    setSelectedRoadmap(null);
    setIsSidebarOpen(true);
  };

  const updateMilestone = (updated: Milestone & { roadmapId: string }) => {
    const updateFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;
    const currentList = viewMode === 'active' ? roadmaps : archivedRoadmaps;

    updateFunc(currentList.map(road => ({
      ...road,
      milestones: road.milestones.map(m => m.id === updated.id ? { ...updated, roadmapId: undefined } as Milestone : m)
    })));
  };

  const toggleSubtask = (roadmapId: string, milestoneId: string, subtaskId: string | number) => {
    const updateFunc = viewMode === 'active' ? setRoadmaps : setArchivedRoadmaps;

    updateFunc(prevList => prevList.map(road => {
      if (road.id !== roadmapId) return road;
      return {
        ...road,
        milestones: road.milestones.map(m => {
          if (m.id !== milestoneId) return m;
          const updatedChecklist = m.checklist.map(t => 
            t.id === subtaskId ? { ...t, completed: !t.completed } : t
          );
          
          const completedCount = updatedChecklist.filter(t => t.completed).length;
          const totalCount = updatedChecklist.length;
          let newStatus: Milestone['status'] = m.status;
          
          if (totalCount > 0) {
            if (completedCount === totalCount) newStatus = 'completed';
            else if (completedCount > 0) newStatus = 'in-progress';
            else newStatus = 'todo';
          }

          const updatedMilestone = { ...m, checklist: updatedChecklist, status: newStatus };
          if (selectedMilestone?.id === milestoneId) {
            setSelectedMilestone({ ...selectedMilestone, ...updatedMilestone });
          }
          return updatedMilestone;
        })
      };
    }));
  };

  const getSortedMilestones = (milestones: Milestone[]) => {
    return [...milestones].sort((a, b) => {
      const order: Record<string, number> = { 'completed': 0, 'in-progress': 1, 'todo': 2 };
      return order[a.status] - order[b.status];
    });
  };

  // Auto-scroll refs per roadmap
  const timelineRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentMilestoneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-scroll to current milestone on mount / data change
  useEffect(() => {
    Object.keys(currentMilestoneRefs.current).forEach(roadId => {
      const el = currentMilestoneRefs.current[roadId];
      const container = timelineRefs.current[roadId];
      if (el && container) {
        // Scroll so the current milestone is near the top of the timeline
        const offset = el.offsetTop - container.offsetTop - 8;
        container.scrollTo({ top: offset, behavior: 'smooth' });
      }
    });
  }, [roadmaps, archivedRoadmaps]);

  const currentDisplayList = useMemo(() => {
    const baseList = viewMode === 'active' ? roadmaps : archivedRoadmaps;
    return baseList.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [roadmaps, archivedRoadmaps, viewMode, searchQuery]);

  const calculateRoadmapProgress = (milestones: Milestone[]) => {
    if (milestones.length === 0) return 0;
    const scoreMap: Record<string, number> = { 'completed': 100, 'in-progress': 50, 'todo': 0 };
    const totalScore = milestones.reduce((acc, m) => acc + scoreMap[m.status], 0);
    return Math.round(totalScore / milestones.length);
  };

  if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'MANAGER')) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden relative -m-8">
      {/* Main Content Area */}
      <div className={`flex flex-col flex-1 h-full min-w-0 transition-all duration-300 ${isSidebarOpen ? 'mr-[400px]' : ''}`}>
        
        {/* Header */}
        <header className="w-full px-6 py-4 flex items-center justify-between bg-base-100 border-b border-base-300 z-30 shrink-0 rounded-t-xl">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {viewMode === 'active' ? 'Strategy Dashboard' : 'Completed Paths'}
              </h1>
              <p className="text-[10px] text-base-content/40 font-medium uppercase tracking-widest leading-none mt-1">Focus Timeline</p>
            </div>
            
            <div className="flex gap-1 bg-base-200 p-0.5 rounded-lg border border-base-300">
              <button onClick={() => scroll('left')} className="p-1.5 hover:bg-base-100 rounded-md text-base-content/50 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => scroll('right')} className="p-1.5 hover:bg-base-100 rounded-md text-base-content/50 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-base-200 p-1 rounded-lg border border-base-300 mr-2">
              <button 
                onClick={() => setViewMode('active')}
                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${viewMode === 'active' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/40 hover:text-base-content/60'}`}
              >
                Active
              </button>
              <button 
                onClick={() => setViewMode('completed')}
                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${viewMode === 'completed' ? 'bg-base-100 text-success shadow-sm' : 'text-base-content/40 hover:text-base-content/60'}`}
              >
                Completed {archivedRoadmaps.length > 0 && `(${archivedRoadmaps.length})`}
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/40" />
              <input 
                type="text" 
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input input-sm input-bordered pl-8 pr-3 w-36 text-xs"
              />
            </div>
            {viewMode === 'active' && (
              <button 
                onClick={addRoadmap}
                className="btn btn-primary btn-sm gap-1.5 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> New Path
              </button>
            )}
          </div>
        </header>

        {/* Grid Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-6 min-w-0" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex gap-8 items-start h-full min-w-max">
            {currentDisplayList.length === 0 ? (
              <div className="w-[80vw] flex flex-col items-center justify-center py-20 bg-base-100/50 rounded-3xl border-2 border-dashed border-base-300">
                <Archive className="w-12 h-12 text-base-content/20 mb-4" />
                <p className="text-base-content/40 font-medium uppercase text-[10px] tracking-widest">
                  {viewMode === 'active' ? 'No Active Paths' : 'No Completed Paths Found'}
                </p>
              </div>
            ) : (
              currentDisplayList.map((road) => {
                const sortedMilestones = getSortedMilestones(road.milestones);
                const progress = calculateRoadmapProgress(road.milestones);
                const isComplete = progress === 100;

                return (
                  <div key={road.id} className="w-[260px] shrink-0 flex flex-col h-full max-h-[calc(100vh-200px)]">
                    {/* Roadmap Header Card */}
                    <div 
                      onClick={() => { setSelectedRoadmap(road); setSelectedMilestone(null); setIsSidebarOpen(true); }}
                      className={`
                        bg-base-100 rounded-xl p-4 border transition-all cursor-pointer relative shrink-0 z-20 group
                        ${selectedRoadmap?.id === road.id ? 'border-primary shadow-md' : 'border-base-300 shadow-sm'}
                      `}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg bg-${road.theme} text-${road.theme}-content shadow-sm`}>
                          {getIcon(road.icon)}
                        </div>
                        <h3 className="font-bold text-sm truncate uppercase tracking-tight flex-1">
                          {road.title}
                        </h3>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {viewMode === 'active' && isComplete && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); archiveRoadmap(road.id); }}
                              className="p-1 text-success hover:bg-success/10 rounded-md transition-all"
                              title="Archive"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {viewMode === 'completed' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); restoreRoadmap(road.id); }}
                              className="p-1 text-primary hover:bg-primary/10 rounded-md transition-all"
                              title="Restore to Active"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: road.id, title: road.title, type: 'roadmap' }); }}
                            className="p-1 text-base-content/30 hover:text-error transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-bold text-base-content/40 uppercase tracking-tighter">
                          <span>{viewMode === 'completed' ? 'Status: Completed' : 'Progress'}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1 w-full bg-base-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-700 ${isComplete ? 'bg-success' : 'bg-primary'}`} 
                            style={{ width: `${progress}%` }} 
                          />
                        </div>
                      </div>
                      
                      {viewMode === 'active' && isComplete && (
                        <div className="mt-3">
                          <button 
                            onClick={(e) => { e.stopPropagation(); archiveRoadmap(road.id); }}
                            className="btn btn-success btn-xs w-full gap-1.5 uppercase tracking-widest text-[9px] font-black"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Save Aside
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Vertical Timeline */}
                    <div 
                      ref={(el) => { timelineRefs.current[road.id] = el; }}
                      className="flex-1 overflow-y-auto pt-6 pb-12 relative" 
                      style={{ scrollbarWidth: 'none' }}
                    >
                      <div className="relative pl-5">
                        <div className="absolute left-[24px] top-0 bottom-10 w-0.5 bg-base-300 rounded-full opacity-60" />
                        
                        <div className="space-y-5">
                          {(() => {
                            // Find the first non-completed milestone (current active)
                            const currentIdx = sortedMilestones.findIndex(m => m.status !== 'completed');
                            const completedCount = currentIdx === -1 ? sortedMilestones.length : currentIdx;

                            return sortedMilestones.map((milestone, idx) => {
                              // Graduated opacity: completed items fade based on distance from current
                              let opacityClass = 'opacity-100';
                              if (milestone.status === 'completed') {
                                const distFromCurrent = completedCount - idx - 1;
                                if (distFromCurrent >= 3) opacityClass = 'opacity-15';
                                else if (distFromCurrent === 2) opacityClass = 'opacity-20';
                                else if (distFromCurrent === 1) opacityClass = 'opacity-30';
                                else opacityClass = 'opacity-40';
                              }
                              const isCurrent = idx === currentIdx;

                              return (
                            <div 
                              key={milestone.id}
                              ref={isCurrent ? (el) => { currentMilestoneRefs.current[road.id] = el; } : undefined}
                              className={`flex flex-col transition-all duration-300 ${opacityClass}`}
                            >
                              <div 
                                onClick={() => { setSelectedMilestone({...milestone, roadmapId: road.id}); setSelectedRoadmap(null); setIsSidebarOpen(true); }}
                                className="relative flex items-start group cursor-pointer"
                              >
                                <div className={`
                                  absolute left-[-2px] top-[6px] w-4 h-4 rounded-full border-2 z-20 transition-all flex items-center justify-center
                                  ${milestone.status === 'completed' ? 'bg-success border-success/30' : 'bg-base-100 border-base-300'}
                                  ${milestone.status === 'in-progress' ? 'border-primary ring-4 ring-primary/10' : ''}
                                `}>
                                  {milestone.status === 'completed' && <Check className="w-2.5 h-2.5 text-success-content" />}
                                  {milestone.status === 'in-progress' && <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
                                </div>

                                <div className={`
                                  ml-8 p-2 rounded-lg border bg-base-100 w-full transition-all text-left
                                  ${selectedMilestone?.id === milestone.id ? 'border-primary shadow-sm' : 'border-transparent group-hover:border-base-300'}
                                `}>
                                  <h4 className={`text-[11px] font-bold leading-[1.2] tracking-tight uppercase ${milestone.status === 'completed' ? 'text-base-content/40' : 'text-base-content'}`}>
                                    {milestone.label}
                                  </h4>
                                </div>
                              </div>

                              {milestone.status !== 'completed' && milestone.checklist.length > 0 && (
                                <div className="ml-[22px] flex flex-col gap-2 py-2">
                                  {milestone.checklist.map((task) => (
                                    <div key={task.id} className="flex items-start gap-3 group">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleSubtask(road.id, milestone.id, task.id); }}
                                        className={`
                                          shrink-0 w-3 h-3 rounded border flex items-center justify-center transition-all mt-[0.5px]
                                          ${task.completed ? 'bg-success border-success' : 'bg-base-100 border-base-300'}
                                        `}
                                      >
                                        {task.completed && <Check className="w-2 h-2 text-success-content" />}
                                      </button>
                                      <div className="flex-1 text-left">
                                        <span className={`block text-[10px] font-medium leading-[13px] transition-colors ${task.completed ? 'text-base-content/30 line-through' : 'text-base-content/50'}`}>
                                          {task.text || 'Step...'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                          );
                            });
                          })()}

                          {viewMode === 'active' && (
                            <button 
                              onClick={() => addMilestone(road.id)}
                              className="ml-6 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-base-300 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all w-[calc(100%-24px)] text-[9px] font-bold uppercase tracking-widest"
                            >
                              <Plus className="w-3 h-3" /> New Point
                            </button>
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

      {/* --- DETAIL SIDEBAR --- */}
      <div className={`
        fixed top-0 right-0 bottom-0 w-[400px] bg-base-100 shadow-2xl border-l border-base-300 
        transform transition-transform duration-300 ease-in-out z-[60] overflow-y-auto flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {selectedRoadmap && (
          <div className="p-6 flex flex-col h-full">
            <header className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-base-200 rounded-lg"><Settings2 className="w-4 h-4" /></div>
                <h2 className="font-bold text-sm uppercase tracking-widest">Roadmap Settings</h2>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="btn btn-ghost btn-sm btn-square">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="space-y-6 flex-1">
              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-2">Title</label>
                <input 
                  type="text" 
                  value={selectedRoadmap.title}
                  onChange={(e) => { 
                    const u = { ...selectedRoadmap, title: e.target.value }; 
                    setSelectedRoadmap(u); 
                    if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                    else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                  }}
                  className="input input-ghost w-full text-lg font-black p-0 uppercase tracking-tighter"
                />
              </section>

              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-2">Agenda</label>
                <textarea 
                  value={selectedRoadmap.agenda}
                  onChange={(e) => { 
                    const u = { ...selectedRoadmap, agenda: e.target.value }; 
                    setSelectedRoadmap(u); 
                    if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                    else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                  }}
                  rows={4}
                  className="textarea textarea-bordered w-full text-xs"
                  placeholder="Define the strategic mission..."
                />
              </section>

              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-3">Theme & Icon</label>
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {['primary', 'secondary', 'accent', 'info', 'neutral'].map(t => (
                    <button 
                      key={t}
                      onClick={() => { 
                        const u = { ...selectedRoadmap, theme: t }; 
                        setSelectedRoadmap(u); 
                        if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                        else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                      }}
                      className={`h-6 rounded-md border-2 transition-all bg-${t} ${selectedRoadmap.theme === t ? 'border-base-content shadow-md scale-105' : 'border-transparent'}`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {Object.keys(iconMap).map(iconName => (
                    <button 
                      key={iconName}
                      onClick={() => { 
                        const u = { ...selectedRoadmap, icon: iconName }; 
                        setSelectedRoadmap(u); 
                        if (viewMode === 'active') setRoadmaps(roadmaps.map(r => r.id === u.id ? u : r));
                        else setArchivedRoadmaps(archivedRoadmaps.map(r => r.id === u.id ? u : r));
                      }}
                      className={`p-2.5 rounded-lg border flex items-center justify-center transition-all ${selectedRoadmap.icon === iconName ? 'bg-primary text-primary-content border-primary' : 'bg-base-200 text-base-content/40 border-base-300'}`}
                    >
                      {getIcon(iconName)}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {selectedMilestone && (
          <div className="p-6 flex flex-col h-full">
            <header className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-base-200 rounded-lg"><Flag className="w-4 h-4" /></div>
                <h2 className="font-bold text-sm uppercase tracking-widest">Point Config</h2>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="btn btn-ghost btn-sm btn-square">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="space-y-8 flex-1">
              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-2">Label</label>
                <input 
                  type="text" 
                  value={selectedMilestone.label}
                  onChange={(e) => { const u = { ...selectedMilestone, label: e.target.value }; setSelectedMilestone(u); updateMilestone(u); }}
                  className="input input-ghost w-full text-xl font-black p-0 uppercase tracking-tight mb-6"
                />
                <div className="grid grid-cols-3 gap-2">
                  {(['todo', 'in-progress', 'completed'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => { const u = { ...selectedMilestone, status }; setSelectedMilestone(u); updateMilestone(u); }}
                      className={`
                        py-2 text-[9px] font-bold uppercase rounded-lg border transition-all
                        ${selectedMilestone.status === status ? 'bg-primary text-primary-content border-primary shadow-md' : 'bg-base-200 text-base-content/40 border-base-300'}
                      `}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block mb-3">Checklist</label>
                <div className="space-y-2">
                  {selectedMilestone.checklist.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 p-2 bg-base-200/50 rounded-lg group">
                      <button 
                        onClick={() => toggleSubtask(selectedMilestone.roadmapId, selectedMilestone.id, task.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${task.completed ? 'bg-success border-success' : 'bg-base-100 border-base-300'}`}
                      >
                        {task.completed && <Check className="w-2.5 h-2.5 text-success-content" />}
                      </button>
                      <input 
                        type="text"
                        value={task.text}
                        onChange={(e) => {
                          const updated = {
                            ...selectedMilestone,
                            checklist: selectedMilestone.checklist.map(t => t.id === task.id ? { ...t, text: e.target.value } : t)
                          };
                          setSelectedMilestone(updated);
                          updateMilestone(updated);
                        }}
                        className={`flex-1 bg-transparent border-none p-0 text-xs focus:outline-none ${task.completed ? 'text-base-content/40 line-through' : 'font-medium'}`}
                        placeholder="New step..."
                      />
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      const updated = {
                        ...selectedMilestone,
                        checklist: [...selectedMilestone.checklist, { id: `st-${Date.now()}`, text: '', completed: false }]
                      };
                      setSelectedMilestone(updated);
                      updateMilestone(updated);
                    }}
                    className="w-full py-2 border border-dashed border-base-300 rounded-lg text-[9px] font-bold text-base-content/40 uppercase tracking-widest hover:border-primary hover:text-primary transition-all"
                  >
                    + Add Step
                  </button>
                </div>
              </section>
            </div>

            <footer className="pt-6 border-t border-base-300 flex justify-between">
              <button 
                onClick={() => setDeleteConfirm({ id: selectedMilestone.id, title: selectedMilestone.label, type: 'milestone', roadmapId: selectedMilestone.roadmapId })}
                className="btn btn-ghost btn-sm text-error"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setIsSidebarOpen(false)} className="btn btn-primary btn-sm uppercase tracking-widest text-[10px] font-bold px-6">
                Confirm
              </button>
            </footer>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-base-content/20 backdrop-blur-[1px] z-[55] transition-opacity" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title={deleteConfirm?.type === 'roadmap' ? 'Delete Roadmap' : 'Delete Milestone'}
        message={`"${deleteConfirm?.title || ''}" and all its ${deleteConfirm?.type === 'roadmap' ? 'milestones' : 'checklist items'} will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
