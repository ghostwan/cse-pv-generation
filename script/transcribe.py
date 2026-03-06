import mlx_whisper
import json

result = mlx_whisper.transcribe(
    "Réunion 10 février 2026.m4a",
    path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
    language="fr",
    verbose=True,
)

with open("transcription.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

with open("transcription.txt", "w", encoding="utf-8") as f:
    f.write(result["text"])

print("\n\n=== TRANSCRIPTION TERMINÉE ===")
print(f"Nombre de segments: {len(result['segments'])}")
