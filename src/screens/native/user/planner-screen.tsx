import {useState} from 'react';

import CalendarScreen from './calendar-screen';
import NotesScreen from './notes-screen';
import type {UserNavigate} from './user-ui';

type PlannerTab = 'calendar' | 'notes';

// Added for Merged Planner: one local tab state wraps the existing Firebase-backed views.
export default function PlannerScreen({uid, onNavigate}: {uid: string; onNavigate: UserNavigate}) {
  const [activeTab, setActiveTab] = useState<PlannerTab>('calendar');
  const planner = {activeTab, onTabChange: setActiveTab};

  return activeTab === 'calendar'
    ? <CalendarScreen onNavigate={onNavigate} page="smartlife_calendar_day" planner={planner} uid={uid} />
    : <NotesScreen onNavigate={onNavigate} page="smartlife_notes" planner={planner} uid={uid} />;
}
