import React, { useState, useCallback } from 'react';
import { AppState } from '../App';

interface Props {
  appState: AppState;
  updateState: (updates: Partial<AppState>) => void;
}

function TemplatePage({ appState, updateState }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState<string>('');

  const handleSelectTemplate = useCallback(async () => {
    try {
      setError(null);
      const filePath = await window.electronAPI.openTemplateFile();
      if (!filePath) return;

      setLoading(true);
      const result = await window.electronAPI.loadTemplate(filePath);

      if (result.success && result.data) {
        updateState({
          templatePath: result.data.path,
          templatePlaceholders: result.data.placeholders,
        });
        setTemplateName(result.data.name);
      } else {
        setError(result.error || 'Erreur lors du chargement du template');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [updateState]);

  const handleRemoveTemplate = useCallback(() => {
    updateState({
      templatePath: null,
      templatePlaceholders: [],
    });
    setTemplateName('');
  }, [updateState]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div>
      <div className="page-header">
        <h2>Template Word</h2>
        <p>Uploadez un fichier Word (.docx) qui servira de modèle pour le procès-verbal</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Template du PV</h3>
          {appState.templatePath && <span className="badge badge-success">Chargé</span>}
        </div>

        {!appState.templatePath ? (
          <div className="upload-zone" onClick={handleSelectTemplate}>
            {loading ? (
              <>
                <span className="spinner" />
                <h3 style={{ marginTop: '12px' }}>Chargement du template...</h3>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9 15 12 12 15 15" />
                </svg>
                <h3>Sélectionner un template Word</h3>
                <p>Fichier .docx avec des placeholders {'{variable}'}</p>
              </>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between" style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-4">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div>
                  <strong>{templateName}</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{appState.templatePath}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={handleSelectTemplate}>
                  Changer
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleRemoveTemplate}>
                  Retirer
                </button>
              </div>
            </div>

            {appState.templatePlaceholders.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ marginBottom: '8px' }}>Placeholders détectés dans le template :</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Ces variables seront remplacées par les données lors de la génération du PV.
                </p>
                <div className="placeholder-list">
                  {appState.templatePlaceholders.map((placeholder, index) => (
                    <span key={index} className="placeholder-tag">
                      {'{' + placeholder + '}'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error mt-4">{error}</div>}

      {/* Help section */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '12px' }}>Comment créer un template ?</h3>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
          <p>Créez un document Word (.docx) et utilisez des placeholders entre accolades :</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li><code>{'{titre}'}</code> - Titre de la réunion</li>
            <li><code>{'{date}'}</code> - Date de la réunion</li>
            <li><code>{'{transcription}'}</code> - Texte de la transcription</li>
            <li><code>{'{participants}'}</code> - Liste des participants</li>
            <li><code>{'{ordre_du_jour}'}</code> - Ordre du jour</li>
            <li><code>{'{decisions}'}</code> - Décisions prises</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            Pour des sections répétées, utilisez la syntaxe de boucle :<br />
            <code>{'{#points}'} ... {'{/points}'}</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default TemplatePage;
