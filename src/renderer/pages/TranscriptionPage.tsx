import React, { useState, useCallback, useEffect } from 'react';
import { AppState } from '../App';

interface Props {
  appState: AppState;
  updateState: (updates: Partial<AppState>) => void;
}

function TranscriptionPage({ appState, updateState }: Props) {
  const [audioFile, setAudioFile] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('base');
  const [language, setLanguage] = useState('fr');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  // Listen for transcription progress events from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onTranscriptionProgress((progress: number) => {
      setProgressPercent(progress);
      if (progress < 2) {
        setProgressLabel('Conversion audio...');
      } else if (progress < 98) {
        setProgressLabel(`Transcription en cours... ${progress}%`);
      } else {
        setProgressLabel('Finalisation...');
      }
    });
    return cleanup;
  }, []);

  const handleSelectFile = useCallback(async () => {
    try {
      const filePath = await window.electronAPI.openAudioFile();
      if (filePath) {
        setAudioFile(filePath);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const handleTranscribe = useCallback(async () => {
    if (!audioFile) return;

    setIsTranscribing(true);
    setError(null);
    setProgressPercent(0);
    setProgressLabel('Préparation...');

    try {
      const result = await window.electronAPI.transcribe(audioFile, { language, model });

      if (result.success && result.data) {
        updateState({
          transcription: result.data.fullText,
          transcriptionSegments: result.data.segments,
        });
        setProgressPercent(100);
        setProgressLabel('');
      } else {
        setError(result.error || 'Erreur inconnue lors de la transcription');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTranscribing(false);
    }
  }, [audioFile, language, model, updateState]);

  const handleEditTranscription = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateState({ transcription: e.target.value });
    },
    [updateState]
  );

  const fileName = audioFile?.split(/[\\/]/).pop() || '';

  return (
    <div>
      <div className="page-header">
        <h2>Transcription audio</h2>
        <p>Sélectionnez un fichier audio de réunion CSE pour le transcrire localement</p>
      </div>

      {/* Step 1: Select audio file */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">1. Fichier audio</h3>
          {audioFile && <span className="badge badge-success">Sélectionné</span>}
        </div>

        {!audioFile ? (
          <div className="upload-zone" onClick={handleSelectFile}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <h3>Sélectionner un fichier audio</h3>
            <p>Formats supportés : WAV, MP3, OGG, FLAC, M4A, WMA, WebM</p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <strong>{fileName}</strong>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{audioFile}</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleSelectFile}>
              Changer
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Configuration */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">2. Configuration</h3>
        </div>

        <div className="flex gap-4">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Modèle Whisper</label>
            <select className="form-select" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="tiny">Tiny (rapide, moins précis)</option>
              <option value="base">Base (équilibré)</option>
              <option value="small">Small (bon compromis)</option>
              <option value="medium">Medium (précis, plus lent)</option>
              <option value="large">Large (très précis, lent)</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Langue</label>
            <select className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
              <option value="de">Allemand</option>
              <option value="es">Espagnol</option>
              <option value="it">Italien</option>
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg w-full"
          onClick={handleTranscribe}
          disabled={!audioFile || isTranscribing}
        >
          {isTranscribing ? (
            <>
              <span className="spinner" />
              Transcription en cours... {progressPercent}%
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Lancer la transcription
            </>
          )}
        </button>

        {isTranscribing && (
          <div style={{ marginTop: '16px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{progressLabel}</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>{progressPercent}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error mt-4">{error}</div>
      )}

      {/* Step 3: Transcription result */}
      {appState.transcription && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">3. Résultat de la transcription</h3>
            <span className="badge badge-success">Terminée</span>
          </div>

          {/* Segments view */}
          {appState.transcriptionSegments.length > 0 && (
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
              {appState.transcriptionSegments.map((segment, index) => (
                <div key={index} className="transcription-segment">
                  <span className="segment-time">{segment.start}</span>
                  <span className="segment-text">{segment.speech}</span>
                </div>
              ))}
            </div>
          )}

          {/* Editable full text */}
          <div className="form-group">
            <label className="form-label">Texte complet (modifiable)</label>
            <textarea
              className="form-textarea"
              value={appState.transcription}
              onChange={handleEditTranscription}
              rows={10}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Titre de la session</label>
            <input
              className="form-input"
              type="text"
              placeholder="Ex: Réunion CSE - Mars 2024"
              value={appState.sessionTitle}
              onChange={(e) => updateState({ sessionTitle: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TranscriptionPage;
