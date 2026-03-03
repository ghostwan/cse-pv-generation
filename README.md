# CSE PV Generation

Application desktop multiplateforme pour la retranscription de reunions CSE et la generation automatique de proces-verbaux au format Word.

## Fonctionnalites

- **Transcription locale** : Transcription audio via Whisper (whisper.cpp) - aucune donnee envoyee sur internet
- **Affichage de la transcription** : Visualisation avec horodatage et edition du texte
- **Upload de template Word** : Chargement d'un fichier .docx avec des placeholders `{variable}`
- **Generation de PV** : Remplissage automatique du template avec les donnees de la reunion et export en .docx

## Stack technique

- **Electron** : Application desktop multiplateforme (Windows, macOS, Linux)
- **React + TypeScript** : Interface utilisateur
- **Vite** : Build et hot reload du frontend
- **whisper-node** : Binding Node.js pour whisper.cpp (transcription locale)
- **docxtemplater + PizZip** : Traitement et generation de fichiers Word
- **electron-store** : Persistance des sessions

## Prerequis

- **Node.js** >= 18
- **ffmpeg** (optionnel, pour convertir les fichiers audio non-WAV)

## Installation

```bash
git clone git@github.com:ghostwan/cse-pv-generation.git
cd cse-pv-generation
npm install
```

## Developpement

```bash
# Lancer en mode developpement
npm run dev

# Compiler le main process uniquement
npm run build:main

# Compiler le renderer uniquement
npm run build:renderer

# Compiler tout
npm run build
```

## Build des executables

```bash
# Toutes les plateformes
npm run package

# macOS uniquement
npm run package:mac

# Windows uniquement
npm run package:win

# Linux uniquement
npm run package:linux
```

Les executables sont generes dans le dossier `release/`.

## Utilisation

### 1. Telecharger un modele Whisper

Allez dans l'onglet **Modeles Whisper** et telechargez au moins un modele. Le modele `base` est recommande pour commencer.

### 2. Transcrire une reunion

1. Allez dans l'onglet **Transcription**
2. Selectionnez un fichier audio (WAV, MP3, OGG, FLAC, M4A, etc.)
3. Choisissez le modele et la langue
4. Lancez la transcription
5. Editez le texte si necessaire

### 3. Uploader un template Word

1. Allez dans l'onglet **Template Word**
2. Selectionnez un fichier .docx contenant des placeholders
3. Verifiez les placeholders detectes

### 4. Generer le PV

1. Allez dans l'onglet **Generer PV**
2. Remplissez les champs correspondant aux placeholders
3. Cliquez sur "Generer le PV Word"
4. Choisissez l'emplacement de sauvegarde

## Format du template Word

Le template utilise la syntaxe docxtemplater. Placez des variables entre accolades dans votre document Word :

- `{titre}` - Titre de la reunion
- `{date}` - Date
- `{transcription}` - Texte de la transcription
- `{participants}` - Liste des participants
- `{ordre_du_jour}` - Ordre du jour
- `{decisions}` - Decisions prises

Pour des sections repetees :

```
{#points}
- {titre_point} : {description_point}
{/points}
```

## Structure du projet

```
cse-pv-generation/
├── src/
│   ├── main/                  # Process principal Electron
│   │   ├── main.ts            # Point d'entree Electron
│   │   ├── preload.ts         # Script preload (bridge IPC)
│   │   └── services/
│   │       ├── transcription.ts   # Service Whisper
│   │       ├── template.ts        # Chargement de templates
│   │       ├── documentGenerator.ts # Generation de PV
│   │       └── store.ts          # Persistance des donnees
│   └── renderer/              # Interface React
│       ├── App.tsx             # Composant principal
│       ├── main.tsx            # Point d'entree React
│       ├── components/         # Composants reutilisables
│       ├── pages/              # Pages de l'application
│       ├── styles/             # Styles CSS
│       └── types/              # Types TypeScript
├── models/                    # Modeles Whisper (telecharges)
├── package.json
├── tsconfig.json              # Config TS renderer
├── tsconfig.main.json         # Config TS main
└── vite.config.ts             # Config Vite
```

## Licence

MIT
