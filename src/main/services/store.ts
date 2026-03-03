import ElectronStore from 'electron-store';

export interface Session {
  id: string;
  date: string;
  title: string;
  transcription: string;
  templatePath?: string;
  outputPath?: string;
}

interface StoreSchema {
  recentSessions: Session[];
  defaultModel: string;
  defaultLanguage: string;
  lastTemplatePath: string;
}

export class StoreService {
  private store: ElectronStore<StoreSchema>;

  constructor() {
    this.store = new ElectronStore<StoreSchema>({
      defaults: {
        recentSessions: [],
        defaultModel: 'base',
        defaultLanguage: 'fr',
        lastTemplatePath: '',
      },
    });
  }

  get(key: string): any {
    return this.store.get(key);
  }

  set(key: string, value: any): void {
    this.store.set(key, value);
  }

  getRecentSessions(): Session[] {
    return (this.store.get('recentSessions') as Session[]) || [];
  }

  saveSession(session: Session): void {
    const sessions = this.getRecentSessions();
    const existingIndex = sessions.findIndex((s) => s.id === session.id);

    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.unshift(session);
    }

    // Keep only the last 20 sessions
    const trimmed = sessions.slice(0, 20);
    this.store.set('recentSessions', trimmed);
  }
}
