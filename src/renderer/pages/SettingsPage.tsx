import React, { useState, useEffect, useCallback } from 'react';
import type { ModelInfo, OllamaModel } from '../types/electron.d';

function SettingsPage() {
  // Whisper models state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Ollama state
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [ollamaBinaryAvailable, setOllamaBinaryAvailable] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState('');
  const [pullProgress, setPullProgress] = useState(0);
  const [newModelName, setNewModelName] = useState('');

  const [error, setError] = useState<string | null>(null);

  // Load Whisper models
  const loadModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      const result = await window.electronAPI.getModels();
      if (result.success && result.data) {
        setModels(result.data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // Check Ollama status
  const checkOllama = useCallback(async () => {
    try {
      const statusResult = await window.electronAPI.getOllamaStatus();
      if (statusResult.success && statusResult.data) {
        setOllamaRunning(statusResult.data.running);
        setOllamaBinaryAvailable(statusResult.data.binaryAvailable);
      }

      const checkResult = await window.electronAPI.checkOllama();
      if (checkResult.success && checkResult.data) {
        const modelsResult = await window.electronAPI.listOllamaModels();
        if (modelsResult.success && modelsResult.data) {
          setOllamaModels(modelsResult.data);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadModels();
    checkOllama();
  }, [loadModels, checkOllama]);

  // Listen for Whisper download progress
  useEffect(() => {
    const cleanup = window.electronAPI.onDownloadProgress((progress: number) => {
      setDownloadProgress(progress);
    });
    return cleanup;
  }, []);

  // Listen for Ollama pull progress
  useEffect(() => {
    const cleanup = window.electronAPI.onOllamaPullProgress((data) => {
      setPullStatus(data.status);
      if (data.total > 0) {
        setPullProgress(Math.round((data.completed / data.total) * 100));
      }
    });
    return cleanup;
  }, []);

  const handleDownloadWhisper = useCallback(async (modelName: string) => {
    try {
      setError(null);
      setDownloading(modelName);
      setDownloadProgress(0);

      const result = await window.electronAPI.downloadModel(modelName);
      if (result.success) {
        await loadModels();
      } else {
        setError(result.error || 'Erreur lors du telechargement');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
      setDownloadProgress(0);
    }
  }, [loadModels]);

  const handlePullOllamaModel = useCallback(async () => {
    const name = newModelName.trim();
    if (!name) return;

    try {
      setError(null);
      setPullingModel(name);
      setPullProgress(0);
      setPullStatus('Demarrage du telechargement...');

      const result = await window.electronAPI.pullOllamaModel(name);
      if (result.success) {
        setNewModelName('');
        await checkOllama();
      } else {
        setError(result.error || 'Erreur lors du telechargement du modele');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPullingModel(null);
      setPullProgress(0);
      setPullStatus('');
    }
  }, [newModelName, checkOllama]);

  const handleDeleteOllamaModel = useCallback(async (modelName: string) => {
    try {
      setError(null);
      const result = await window.electronAPI.deleteOllamaModel(modelName);
      if (result.success) {
        await checkOllama();
      } else {
        setError(result.error || 'Erreur lors de la suppression du modele');
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [checkOllama]);

  const getWhisperModelDescription = (name: string): string => {
    switch (name) {
      case 'tiny': return 'Le plus rapide. Adapte pour des tests rapides.';
      case 'base': return 'Bon compromis vitesse/qualite. Recommande.';
      case 'small': return 'Bonne qualite. Temps de traitement modere.';
      case 'medium': return 'Tres bonne qualite. Plus lent.';
      case 'large': return 'Meilleure qualite. Necessite beaucoup de RAM.';
      default: return '';
    }
  };

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const suggestedModels = [
    { name: 'llama3.2:3b', desc: 'Meta Llama 3.2 3B - Bon equilibre performance/taille' },
    { name: 'mistral:7b', desc: 'Mistral 7B - Tres bon pour le francais' },
    { name: 'gemma2:2b', desc: 'Google Gemma 2 2B - Leger et rapide' },
    { name: 'qwen2.5:3b', desc: 'Qwen 2.5 3B - Bon en multilangue' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>Parametres</h2>
        <p>Gerez les modeles de transcription et d'analyse IA</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Ollama (Embedded) */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Ollama (IA embarquee)</h3>
          <span className={`badge ${ollamaRunning ? 'badge-success' : ollamaBinaryAvailable ? 'badge-warning' : 'badge-danger'}`}>
            {ollamaRunning ? 'En cours' : ollamaBinaryAvailable ? 'Arrete' : 'Non installe'}
          </span>
        </div>

        {!ollamaBinaryAvailable && (
          <div className="alert alert-error">
            Le binaire Ollama n'a pas ete trouve. Executez <code>node scripts/download-ollama.js</code> pour le telecharger.
          </div>
        )}

        {ollamaRunning && (
          <>
            {/* Pull new model */}
            <div className="form-group">
              <label className="form-label">Telecharger un modele</label>
              <div className="flex gap-2">
                <input
                  className="form-input"
                  type="text"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="Ex: llama3.2:3b, mistral:7b..."
                  disabled={pullingModel !== null}
                  onKeyDown={(e) => e.key === 'Enter' && handlePullOllamaModel()}
                />
                <button
                  className="btn btn-primary"
                  onClick={handlePullOllamaModel}
                  disabled={!newModelName.trim() || pullingModel !== null}
                >
                  {pullingModel ? <span className="spinner" /> : 'Telecharger'}
                </button>
              </div>
            </div>

            {/* Pull progress */}
            {pullingModel && (
              <div style={{ marginBottom: '16px' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Telechargement de <strong>{pullingModel}</strong> — {pullStatus}
                  </span>
                  {pullProgress > 0 && (
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>{pullProgress}%</span>
                  )}
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-bar-fill ${pullProgress === 0 ? 'progress-bar-indeterminate' : ''}`}
                    style={{ width: pullProgress > 0 ? `${pullProgress}%` : undefined }}
                  />
                </div>
              </div>
            )}

            {/* Suggested models */}
            {ollamaModels.length === 0 && !pullingModel && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Modeles recommandes pour l'analyse de PV CSE :
                </p>
                <div className="flex flex-col gap-2">
                  {suggestedModels.map((m) => (
                    <div key={m.name} className="flex items-center justify-between" style={{
                      padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius)',
                    }}>
                      <div>
                        <strong style={{ fontSize: '14px' }}>{m.name}</strong>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.desc}</p>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setNewModelName(m.name);
                          // Trigger pull
                          setTimeout(async () => {
                            setPullingModel(m.name);
                            setPullProgress(0);
                            setPullStatus('Demarrage...');
                            try {
                              const result = await window.electronAPI.pullOllamaModel(m.name);
                              if (result.success) await checkOllama();
                              else setError(result.error || 'Erreur');
                            } catch (err: any) {
                              setError(err.message);
                            } finally {
                              setPullingModel(null);
                              setPullProgress(0);
                              setPullStatus('');
                              setNewModelName('');
                            }
                          }, 0);
                        }}
                        disabled={pullingModel !== null}
                      >
                        Installer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Installed models list */}
            {ollamaModels.length > 0 && (
              <div>
                <label className="form-label">Modeles installes ({ollamaModels.length})</label>
                <div className="flex flex-col gap-2">
                  {ollamaModels.map((model) => (
                    <div key={model.name} className="flex items-center justify-between" style={{
                      padding: '10px 14px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius)',
                    }}>
                      <div>
                        <strong style={{ fontSize: '14px' }}>{model.name}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>
                          {formatSize(model.size)}
                          {model.details.parameter_size ? ` - ${model.details.parameter_size}` : ''}
                        </span>
                      </div>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteOllamaModel(model.name)}
                        disabled={pullingModel !== null}
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Whisper Models */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Modeles Whisper (transcription)</h3>
        </div>

        <div className="alert alert-info" style={{ marginBottom: '16px' }}>
          Les modeles Whisper sont executes localement. Un modele plus grand = meilleure qualite mais plus de RAM et de temps.
        </div>

        {loadingModels ? (
          <div className="text-center" style={{ padding: '20px' }}>
            <span className="spinner" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {models.map((model) => (
              <div key={model.name} className="flex items-center justify-between" style={{
                padding: '12px 16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius)',
              }}>
                <div>
                  <div className="flex items-center gap-2">
                    <strong style={{ textTransform: 'capitalize' }}>{model.name}</strong>
                    <span className={`badge ${model.downloaded ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                      {model.downloaded ? 'Pret' : 'Non telecharge'}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {getWhisperModelDescription(model.name)} — {model.size}
                  </p>
                </div>

                <div>
                  {model.downloaded ? (
                    <span style={{ color: 'var(--success)', fontSize: '13px' }}>OK</span>
                  ) : downloading === model.name ? (
                    <div style={{ width: '150px' }}>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${downloadProgress}%` }} />
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'center' }}>
                        {downloadProgress}%
                      </p>
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleDownloadWhisper(model.name)}
                      disabled={downloading !== null}
                    >
                      Telecharger
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
