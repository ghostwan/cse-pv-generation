# CSE PV Generation

Cross-platform desktop application for transcribing CSE (Works Council) meetings and automatically generating minutes in Word format.

## Features

- **Local transcription**: Audio transcription via Whisper (whisper.cpp) - no data sent over the internet
- **Transcription display**: View with timestamps and edit the text
- **Word template upload**: Load a .docx file with `{variable}` placeholders
- **Minutes generation**: Automatically fill the template with meeting data and export to .docx

## Tech Stack

- **Electron**: Cross-platform desktop application (Windows, macOS, Linux)
- **React + TypeScript**: User interface
- **Vite**: Frontend bundling and hot reload
- **whisper-node**: Node.js bindings for whisper.cpp (local transcription)
- **docxtemplater + PizZip**: Word file processing and generation
- **electron-store**: Session persistence
- **ffmpeg-static**: Embedded audio conversion (no external dependency required)

## Prerequisites

- **Node.js** >= 18

## Installation

```bash
git clone git@github.com:ghostwan/cse-pv-generation.git
cd cse-pv-generation
npm install
```

## Development

```bash
# Run in development mode
npm run dev

# Build the main process only
npm run build:main

# Build the renderer only
npm run build:renderer

# Build everything
npm run build
```

## Packaging

```bash
# Auto-detect current OS
npm run package

# macOS only
npm run package:mac

# Windows only
npm run package:win

# Linux only
npm run package:linux

# All platforms
npm run package:all
```

Executables are generated in the `release/` directory.

## Usage

### 1. Download a Whisper model

Go to the **Whisper Models** tab and download at least one model. The `base` model is recommended to start with.

### 2. Transcribe a meeting

1. Go to the **Transcription** tab
2. Select an audio file (WAV, MP3, OGG, FLAC, M4A, etc.)
3. Choose the model and language
4. Start the transcription
5. Edit the text if needed

### 3. Upload a Word template

1. Go to the **Word Template** tab
2. Select a .docx file containing placeholders
3. Review the detected placeholders

### 4. Generate the minutes

1. Go to the **Generate Minutes** tab
2. Fill in the fields corresponding to the placeholders
3. Click "Generate Word Minutes"
4. Choose the save location

## Word Template Format

The template uses docxtemplater syntax. Place variables between curly braces in your Word document:

- `{title}` - Meeting title
- `{date}` - Date
- `{transcription}` - Transcription text
- `{participants}` - List of participants
- `{agenda}` - Agenda
- `{decisions}` - Decisions made

For repeated sections:

```
{#items}
- {item_title}: {item_description}
{/items}
```

## Project Structure

```
cse-pv-generation/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── main.ts            # Electron entry point
│   │   ├── preload.ts         # Preload script (IPC bridge)
│   │   └── services/
│   │       ├── transcription.ts   # Whisper service
│   │       ├── template.ts        # Template loading
│   │       ├── documentGenerator.ts # Minutes generation
│   │       └── store.ts          # Data persistence
│   └── renderer/              # React interface
│       ├── App.tsx             # Main component
│       ├── main.tsx            # React entry point
│       ├── components/         # Reusable components
│       ├── pages/              # Application pages
│       ├── styles/             # CSS styles
│       └── types/              # TypeScript types
├── build/                     # Application icons
├── scripts/                   # Build and packaging scripts
├── models/                    # Whisper models (downloaded at runtime)
├── package.json
├── tsconfig.json              # Renderer TS config
├── tsconfig.main.json         # Main process TS config
└── vite.config.ts             # Vite config
```

## License

MIT
