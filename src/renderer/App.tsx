import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TranscriptionPage from './pages/TranscriptionPage';
import TemplatePage from './pages/TemplatePage';
import GeneratePage from './pages/GeneratePage';
import ModelsPage from './pages/ModelsPage';
import './types/electron.d';

type Page = 'transcription' | 'template' | 'generate' | 'models';

export interface AppState {
  transcription: string;
  transcriptionSegments: { start: string; end: string; speech: string }[];
  templatePath: string | null;
  templatePlaceholders: string[];
  sessionTitle: string;
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('transcription');
  const [appState, setAppState] = useState<AppState>({
    transcription: '',
    transcriptionSegments: [],
    templatePath: null,
    templatePlaceholders: [],
    sessionTitle: '',
  });

  const updateState = (updates: Partial<AppState>) => {
    setAppState((prev) => ({ ...prev, ...updates }));
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'transcription':
        return <TranscriptionPage appState={appState} updateState={updateState} />;
      case 'template':
        return <TemplatePage appState={appState} updateState={updateState} />;
      case 'generate':
        return <GeneratePage appState={appState} updateState={updateState} />;
      case 'models':
        return <ModelsPage />;
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
