import React, { useState, useEffect, useCallback } from 'react';
import type { ModelInfo, OllamaModel } from '../types/electron.d';

function SettingsPage() {
  // Whisper models state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Ollama state
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);

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

  // Check Ollama
  const checkOllama = useCallback(async () => {
    try {
      setOllamaAvailable(null);
      const result = await window.electronAPI.checkOllama();
      const available = result.success && result.data === true;
      setOllamaAvailable(available);

      if (available) {
        const modelsResult = await window.electronAPI.listOllamaModels();
        if (modelsResult.success && modelsResult.data) {
          setOllamaModels(modelsResult.data);
        }
      }
    } catch {
      setOllamaAvailable(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
    checkOllama();

    // Load saved Ollama URL
    window.electronAPI.storeGet('ollamaUrl').then((url: any) => {
      if (url) setOllamaUrl(url);
    });
  }, [loadModels, checkOllama]);

  useEffect(() => {
    const cleanup = window.electronAPI.onDownloadProgress((progress: number) => {
      setDownloadProgress(progress);
    });
    return cleanup;
  }, []);

  const handleDownload = useCallback(async (modelName: string) => {
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

  const handleSaveOllamaUrl = useCallback(async () => {
    try {
      await window.electronAPI.setOllamaUrl(ollamaUrl);
      await checkOllama();
    } catch (err: any) {
      setError(err.message);
    }
  }, [ollamaUrl, checkOllama]);

  const getModelDescription = (name: string): string => {
    switch (name) {
      case 'tiny': return 'Le plus rapide. Adapte pour des tests rapides. Precision limitee.';
      case 'base': return 'Bon compromis vitesse/qualite. Recommande pour commencer.';
      case 'small': return 'Bonne qualite de transcription. Temps de traitement modere.';
      case 'medium': return 'Tres bonne qualite. Recommande pour les transcriptions finales.';
      case 'large': return 'Meilleure qualite possible. Necessite beaucoup de RAM et de temps.';
      default: return '';
    }
  };

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div>
      <div className="page-header">
        <h2>Parametres</h2>
        <p>Configurez les modeles Whisper et la connexion Ollama</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Ollama Configuration */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Ollama (LLM local)</h3>
          <span className={`badge ${ollamaAvailable ? 'badge-success' : ollamaAvailable === false ? 'badge-danger' : 'badge-warning'}`}>
            {ollamaAvailable === null ? 'Verification...' : ollamaAvailable ? 'Connecte' : 'Non connecte'}
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">URL du serveur Ollama</label>
          <div className="flex gap-2">
            <input
              className="form-input"
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
            />
            <button className="btn btn-primary" onClick={handleSaveOllamaUrl}>
              Tester
            </button>
          </div>
        </div>

        {ollamaAvailable && ollamaModels.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <label className="form-label">Modeles disponibles</label>
            <div className="flex flex-col gap-2">
              {ollamaModels.map((model) => (
                <div key={model.name} className="flex items-center justify-between" style={{
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius)',
                  fontSize: '14px',
                }}>
                  <span><strong>{model.name}</strong></span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {formatSize(model.size)}
                    {model.details.parameter_size ? ` - ${model.details.parameter_size}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {ollamaAvailable === false && (
          <div className="alert alert-info" style={{ marginTop: '12px' }}>
            Assurez-vous qu'Ollama est installe et lance. Commandes utiles :
            <br /><br />
            <code>ollama serve</code> — Demarrer le serveur<br />
            <code>ollama pull llama3</code> — Telecharger un modele<br />
            <code>ollama list</code> — Lister les modeles installes
          </div>
        )}
      </div>

      {/* Whisper Models */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Modeles Whisper (transcription)</h3>
        </div>

        <div className="alert alert-info" style={{ marginBottom: '16px' }}>
          Les modeles Whisper sont executes localement. Un modele plus grand offre une meilleure qualite
          mais necessite plus de RAM et de temps de traitement.
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
                    {getModelDescription(model.name)} — {model.size}
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
                      onClick={() => handleDownload(model.name)}
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
