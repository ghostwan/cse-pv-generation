import React, { useState, useCallback, useEffect } from 'react';
import type { AppState } from '../App';
import type { OllamaModel, PVContent } from '../types/electron.d';

interface Props {
  appState: AppState;
  updateState: (updates: Partial<AppState>) => void;
}

function GeneratePage({ appState, updateState }: Props) {
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check Ollama availability on mount
  useEffect(() => {
    checkOllama();
  }, []);

  // Listen for PV generation progress
  useEffect(() => {
    const cleanup = window.electronAPI.onPVGenerationProgress((text: string) => {
      setProgressText(text);
    });
    return cleanup;
  }, []);

  const checkOllama = useCallback(async () => {
    try {
      const result = await window.electronAPI.checkOllama();
      const available = result.success && result.data === true;
      setOllamaAvailable(available);

      if (available) {
        const modelsResult = await window.electronAPI.listOllamaModels();
        if (modelsResult.success && modelsResult.data) {
          setOllamaModels(modelsResult.data);
          if (modelsResult.data.length > 0 && !selectedModel) {
            setSelectedModel(modelsResult.data[0].name);
          }
        }
      }
    } catch {
      setOllamaAvailable(false);
    }
  }, [selectedModel]);

  const handleGenerate = useCallback(async () => {
    if (!appState.transcription || !selectedModel) return;

    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    setProgressText('Envoi de la transcription a Ollama...');

    try {
      const result = await window.electronAPI.generatePV(appState.transcription, selectedModel);

      if (result.success && result.data) {
        updateState({ pvContent: result.data });
        setProgressText('');
        setSuccess('PV genere avec succes ! Verifiez le contenu ci-dessous puis exportez en Word.');
      } else {
        setError(result.error || 'Erreur lors de la generation du PV');
        setProgressText('');
      }
    } catch (err: any) {
      setError(err.message);
      setProgressText('');
    } finally {
      setIsGenerating(false);
    }
  }, [appState.transcription, selectedModel, updateState]);

  const handleSaveWord = useCallback(async () => {
    if (!appState.pvContent) return;

    try {
      setIsSaving(true);
      setError(null);

      const outputPath = await window.electronAPI.saveDocument();
      if (!outputPath) {
        setIsSaving(false);
        return;
      }

      const result = await window.electronAPI.generateDocument(
        appState.pvContent,
        outputPath,
        appState.templatePath || undefined
      );

      if (result.success) {
        setSuccess(`PV Word exporte avec succes : ${outputPath}`);

        // Save session
        const session = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          title: appState.sessionTitle || appState.pvContent.titre || 'Session sans titre',
          transcription: appState.transcription,
          outputPath,
        };
        await window.electronAPI.saveSession(session);
      } else {
        setError(result.error || 'Erreur lors de la generation du document Word');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [appState]);

  const formatModelSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const pvContent = appState.pvContent;

  return (
    <div>
      <div className="page-header">
        <h2>Generer le PV</h2>
        <p>Analysez la transcription avec Ollama et generez un proces-verbal professionnel</p>
      </div>

      {/* Prerequisites */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '16px' }}>Prerequis</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <span className={`badge ${appState.transcription ? 'badge-success' : 'badge-danger'}`}>
              {appState.transcription ? 'OK' : 'Manquant'}
            </span>
            <span>Transcription de la reunion</span>
            {appState.transcription && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ({appState.transcription.length.toLocaleString()} caracteres)
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className={`badge ${ollamaAvailable ? 'badge-success' : ollamaAvailable === false ? 'badge-danger' : 'badge-warning'}`}>
              {ollamaAvailable === null ? 'Verification...' : ollamaAvailable ? 'OK' : 'Non connecte'}
            </span>
            <span>Ollama (LLM local)</span>
            {ollamaAvailable === false && (
              <button className="btn btn-secondary btn-sm" onClick={checkOllama}>
                Reverifier
              </button>
            )}
          </div>
        </div>

        {ollamaAvailable === false && (
          <div className="alert alert-error" style={{ marginTop: '16px' }}>
            Le serveur Ollama embarque n'est pas encore pret.
            Il demarre automatiquement avec l'application — patientez quelques secondes puis reverifiez.
            <br /><br />
            Si le probleme persiste, verifiez dans les <strong>Parametres</strong> que le binaire Ollama est bien installe.
          </div>
        )}
      </div>

      {/* Model selection & generation */}
      {ollamaAvailable && appState.transcription && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Analyse par IA</h3>
            {pvContent && <span className="badge badge-success">Genere</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Modele Ollama</label>
            <select
              className="form-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isGenerating}
            >
              {ollamaModels.length === 0 && (
                <option value="">Aucun modele disponible</option>
              )}
              {ollamaModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} ({formatModelSize(model.size)}
                  {model.details.parameter_size ? ` - ${model.details.parameter_size}` : ''})
                </option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Utilisez un modele performant (ex: llama3, mistral, gemma2) pour de meilleurs resultats.
              Pour installer un modele : <code>ollama pull llama3</code>
            </p>
          </div>

          <button
            className="btn btn-primary btn-lg w-full"
            onClick={handleGenerate}
            disabled={isGenerating || !selectedModel || ollamaModels.length === 0}
          >
            {isGenerating ? (
              <>
                <span className="spinner" />
                Analyse en cours...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Analyser et generer le PV
              </>
            )}
          </button>

          {isGenerating && progressText && (
            <div style={{ marginTop: '16px' }}>
              <div className="progress-bar" style={{ marginBottom: '8px' }}>
                <div className="progress-bar-fill progress-bar-indeterminate" />
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {progressText.length > 200
                  ? '...' + progressText.slice(-200)
                  : progressText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error / success messages */}
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* PV Preview */}
      {pvContent && (
        <>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Apercu du PV</h3>
              <button
                className="btn btn-success"
                onClick={handleSaveWord}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <span className="spinner" />
                    Export...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Exporter en Word
                  </>
                )}
              </button>
            </div>

            {/* Title & date */}
            <div className="pv-preview-header">
              <h2 style={{ fontSize: '20px', color: 'var(--primary)', marginBottom: '4px' }}>
                {pvContent.titre}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{pvContent.date}</p>
            </div>

            {/* Participants */}
            <div className="pv-preview-section">
              <h4 className="pv-section-title">Participants</h4>
              <div className="flex gap-4" style={{ marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <span className="pv-label pv-label-direction">Direction</span>
                  <p style={{ fontSize: '14px', marginTop: '4px' }}>
                    {pvContent.participants_direction.length > 0
                      ? pvContent.participants_direction.join(', ')
                      : 'Non identifie(s)'}
                  </p>
                </div>
                <div style={{ flex: 1 }}>
                  <span className="pv-label pv-label-cse">CSE</span>
                  <p style={{ fontSize: '14px', marginTop: '4px' }}>
                    {pvContent.participants_cse.length > 0
                      ? pvContent.participants_cse.join(', ')
                      : 'Non identifie(s)'}
                  </p>
                </div>
              </div>
            </div>

            {/* Ordre du jour */}
            {pvContent.ordre_du_jour.length > 0 && (
              <div className="pv-preview-section">
                <h4 className="pv-section-title">Ordre du jour</h4>
                <ol style={{ paddingLeft: '20px', fontSize: '14px' }}>
                  {pvContent.ordre_du_jour.map((item, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>{item}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Sections */}
          {pvContent.sections.map((section, index) => (
            <div key={index} className="card">
              <h3 className="card-title" style={{ color: 'var(--primary)', marginBottom: '16px' }}>
                {index + 1}. {section.titre}
              </h3>

              {section.resume_direction && (
                <div className="pv-block pv-block-direction">
                  <span className="pv-label pv-label-direction">Direction</span>
                  <p>{section.resume_direction}</p>
                </div>
              )}

              {section.resume_cse && (
                <div className="pv-block pv-block-cse">
                  <span className="pv-label pv-label-cse">CSE</span>
                  <p>{section.resume_cse}</p>
                </div>
              )}

              {section.discussion && (
                <div className="pv-block pv-block-discussion">
                  <span className="pv-label pv-label-discussion">Echanges</span>
                  <p style={{ fontStyle: 'italic' }}>{section.discussion}</p>
                </div>
              )}
            </div>
          ))}

          {/* Decisions */}
          {pvContent.decisions.length > 0 && (
            <div className="card">
              <h3 className="card-title" style={{ color: 'var(--success)', marginBottom: '12px' }}>
                Decisions prises
              </h3>
              <ul style={{ paddingLeft: '20px' }}>
                {pvContent.decisions.map((decision, i) => (
                  <li key={i} style={{ marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                    {decision}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Conclusion */}
          {pvContent.conclusion && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '8px' }}>Conclusion</h3>
              <p style={{ fontSize: '14px', lineHeight: '1.7' }}>{pvContent.conclusion}</p>
            </div>
          )}

          {/* Bottom export button */}
          <div className="card" style={{ textAlign: 'center' }}>
            <button
              className="btn btn-success btn-lg"
              onClick={handleSaveWord}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <span className="spinner" />
                  Export en cours...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Exporter le PV en Word (.docx)
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Empty state when no transcription */}
      {!appState.transcription && (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <h3>Aucune transcription disponible</h3>
          <p>Commencez par transcrire un fichier audio ou importez une transcription existante.</p>
        </div>
      )}
    </div>
  );
}

export default GeneratePage;
