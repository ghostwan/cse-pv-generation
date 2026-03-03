import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TranscriptionPage from './pages/TranscriptionPage';
import GeneratePage from './pages/GeneratePage';
import SettingsPage from './pages/SettingsPage';
import './types/electron.d';
import type { PVContent } from './types/electron.d';

export type Page = 'transcription' | 'generate' | 'settings';

export interface AppState {
  transcription: string;
  transcriptionSegments: { start: string; end: string; speech: string }[];
  sessionTitle: string;
  pvContent: PVContent | null;
  templatePath: string | null;
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('transcription');
  const [appState, setAppState] = useState<AppState>({
    transcription: '',
    transcriptionSegments: [],
    sessionTitle: '',
    pvContent: null,
    templatePath: null,
  });

  const updateState = (updates: Partial<AppState>) => {
    setAppState((prev) => ({ ...prev, ...updates }));
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'transcription':
        return <TranscriptionPage appState={appState} updateState={updateState} />;
      case 'generate':
        return <GeneratePage appState={appState} updateState={updateState} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <TranscriptionPage appState={appState} updateState={updateState} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} appState={appState} />
      <main className="main-content">{renderPage()}</main>
    </div>
  );
}

export default App;
