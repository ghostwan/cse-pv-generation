import React, { useState, useEffect, useCallback } from 'react';

interface ModelInfo {
  name: string;
  size: string;
  downloaded: boolean;
  path: string;
}

function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getModels();
      if (result.success && result.data) {
        setModels(result.data);
      } else {
        setError(result.error || 'Erreur lors du chargement des modèles');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

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
        setError(result.error || 'Erreur lors du téléchargement');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
      setDownloadProgress(0);
    }
  }, [loadModels]);

  const getModelDescription = (name: string): string => {
    switch (name) {
      case 'tiny':
        return 'Le plus rapide. Adapté pour des tests rapides. Précision limitée.';
      case 'base':
        return 'Bon compromis vitesse/qualité. Recommandé pour commencer.';
      case 'small':
        return 'Bonne qualité de transcription. Temps de traitement modéré.';
      case 'medium':
        return 'Très bonne qualité. Recommandé pour les transcriptions finales.';
      case 'large':
        return 'Meilleure qualité possible. Nécessite beaucoup de RAM et de temps.';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <span className="spinner" />
        <h3 style={{ marginTop: '16px' }}>Chargement des modèles...</h3>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Modèles Whisper</h2>
        <p>Téléchargez et gérez les modèles de transcription Whisper</p>
      </div>

      <div className="alert alert-info">
        Les modèles Whisper sont exécutés localement sur votre machine. Aucune donnée n'est envoyée sur internet lors de la transcription.
        Un modèle plus grand offre une meilleure qualité mais nécessite plus de RAM et de temps de traitement.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {models.map((model) => (
        <div key={model.name} className="card">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="card-title" style={{ textTransform: 'capitalize' }}>
                  {model.name}
                </h3>
                <span className={`badge ${model.downloaded ? 'badge-success' : 'badge-warning'}`}>
                  {model.downloaded ? 'Téléchargé' : 'Non téléchargé'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {getModelDescription(model.name)}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Taille : {model.size}
              </p>
            </div>

            <div>
              {model.downloaded ? (
                <span style={{ color: 'var(--success)', fontSize: '14px', fontWeight: '500' }}>
                  Prêt
                </span>
              ) : downloading === model.name ? (
                <div style={{ width: '200px' }}>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
                    {downloadProgress}%
                  </p>
                </div>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownload(model.name)}
                  disabled={downloading !== null}
                >
                  Télécharger
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ModelsPage;
