import React, { useState, useCallback, useEffect } from 'react';
import { AppState } from '../App';

interface Props {
  appState: AppState;
  updateState: (updates: Partial<AppState>) => void;
}

interface PlaceholderValues {
  [key: string]: string;
}

function GeneratePage({ appState, updateState }: Props) {
  const [placeholderValues, setPlaceholderValues] = useState<PlaceholderValues>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Pre-fill known placeholders
  useEffect(() => {
    const defaults: PlaceholderValues = {};
    for (const p of appState.templatePlaceholders) {
      const key = p.replace('#', '');
      if (key === 'transcription' || key === 'retranscription') {
        defaults[key] = appState.transcription;
      } else if (key === 'titre' || key === 'title') {
        defaults[key] = appState.sessionTitle || '';
      } else if (key === 'date') {
        defaults[key] = new Date().toLocaleDateString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } else {
        defaults[key] = placeholderValues[key] || '';
      }
    }
    setPlaceholderValues(defaults);
  }, [appState.templatePlaceholders, appState.transcription, appState.sessionTitle]);

  const handleValueChange = useCallback((key: string, value: string) => {
    setPlaceholderValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!appState.templatePath) {
      setError('Aucun template sélectionné. Veuillez d\'abord uploader un template Word.');
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setIsGenerating(true);

      const outputPath = await window.electronAPI.saveDocument();
      if (!outputPath) {
        setIsGenerating(false);
        return;
      }

      const result = await window.electronAPI.generateDocument(
        appState.templatePath,
        placeholderValues,
        outputPath
      );

      if (result.success) {
        setSuccess(`PV généré avec succès : ${outputPath}`);

        // Save session
        const session = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          title: appState.sessionTitle || 'Session sans titre',
          transcription: appState.transcription,
          templatePath: appState.templatePath,
          outputPath: outputPath,
        };
        await window.electronAPI.saveSession(session);
      } else {
        setError(result.error || 'Erreur lors de la génération du document');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [appState, placeholderValues]);

  const isReady = appState.transcription && appState.templatePath;

  return (
    <div>
      <div className="page-header">
        <h2>Générer le PV</h2>
        <p>Remplissez les champs et générez le procès-verbal au format Word</p>
      </div>

      {/* Status checks */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '16px' }}>Prérequis</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <span className={`badge ${appState.transcription ? 'badge-success' : 'badge-danger'}`}>
              {appState.transcription ? 'OK' : 'Manquant'}
            </span>
            <span>Transcription de la réunion</span>
          </div>
          <div className="flex items-center gap-4">
            <span className={`badge ${appState.templatePath ? 'badge-success' : 'badge-danger'}`}>
              {appState.templatePath ? 'OK' : 'Manquant'}
            </span>
            <span>Template Word</span>
          </div>
        </div>
      </div>

      {/* Placeholder values */}
      {appState.templatePlaceholders.length > 0 && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>Données du PV</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Remplissez les champs ci-dessous. Les valeurs seront insérées dans le template.
          </p>

          {appState.templatePlaceholders
            .filter((p) => !p.startsWith('#'))
            .map((placeholder) => {
              const isLongField = ['transcription', 'retranscription', 'decisions', 'ordre_du_jour', 'observations', 'remarques'].includes(placeholder);
              return (
                <div key={placeholder} className="form-group">
                  <label className="form-label">{placeholder}</label>
                  {isLongField ? (
                    <textarea
                      className="form-textarea"
                      value={placeholderValues[placeholder] || ''}
                      onChange={(e) => handleValueChange(placeholder, e.target.value)}
                      rows={6}
                      placeholder={`Valeur pour {${placeholder}}`}
                    />
                  ) : (
                    <input
                      className="form-input"
                      type="text"
                      value={placeholderValues[placeholder] || ''}
                      onChange={(e) => handleValueChange(placeholder, e.target.value)}
                      placeholder={`Valeur pour {${placeholder}}`}
                    />
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Generate button */}
      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <button
          className="btn btn-success btn-lg w-full"
          onClick={handleGenerate}
          disabled={!isReady || isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="spinner" />
              Génération en cours...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Générer le PV Word
            </>
          )}
        </button>

        {!isReady && (
          <p style={{ textAlign: 'center', marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
            {!appState.transcription && !appState.templatePath
              ? 'Veuillez d\'abord transcrire un audio et uploader un template.'
              : !appState.transcription
              ? 'Veuillez d\'abord transcrire un fichier audio.'
              : 'Veuillez d\'abord uploader un template Word.'}
          </p>
        )}
      </div>
    </div>
  );
}

export default GeneratePage;
