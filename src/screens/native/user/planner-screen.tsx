import Head from 'expo-router/head';
import {useState} from 'react';
import {Platform} from 'react-native';

import {pageTitle} from '@/lib/page-titles';

import CalendarScreen from './calendar-screen';
import AdaptiveSchedulingScreen from './adaptive-scheduling-screen';
import NotesScreen from './notes-screen';
import type {UserNavigate} from './user-ui';

export type PlannerTab = 'adaptive' | 'calendar' | 'notes';

// The switcher changes what is on screen without changing the route, so the
// planner names its own tab in the browser title, as the page each tab
// stands for would. Its Head sits below the route's, so it wins.
const TAB_PAGE: Record<PlannerTab, string> = {adaptive: 'smartlife_adaptive_scheduling', calendar: 'smartlife_planner', notes: 'smartlife_planner_notes'};

// Added for Merged Planner: one local tab state wraps the existing Firebase-backed views.
export default function PlannerScreen({uid, onNavigate, initialTab = 'calendar'}: {uid: string; onNavigate: UserNavigate; initialTab?: PlannerTab}) {
  const [activeTab, setActiveTab] = useState<PlannerTab>(initialTab);
  const planner = {activeTab, onTabChange: setActiveTab};

  const title = Platform.OS === 'web' ? <Head><title>{pageTitle('user', TAB_PAGE[activeTab])}</title></Head> : null;

  if (activeTab === 'calendar') return <>{title}<CalendarScreen onNavigate={onNavigate} page="smartlife_calendar_day" planner={planner} uid={uid} /></>;
  if (activeTab === 'notes') return <>{title}<NotesScreen onNavigate={onNavigate} page="smartlife_notes" planner={planner} uid={uid} /></>;
  return <>{title}<AdaptiveSchedulingScreen onNavigate={onNavigate} planner={planner} uid={uid} /></>;
}
