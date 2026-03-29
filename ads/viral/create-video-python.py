#!/usr/bin/env python3
import subprocess
import json
from pathlib import Path

DIR = Path("/Users/brandonkatz/.openclaw/workspace/fitsorted/ads/viral")

# Load transcript for timing
with open(DIR / "nandos-2000cal-transcript.json") as f:
    transcript = json.load(f)

words = transcript["words"]

# Create segments with images
segments = [
    {"image": "image1.png", "start": 0, "end": 15.5},    # The Trap
    {"image": "image2.png", "start": 15.5, "end": 28.9}, # Smart Order
    {"image": "image3.png", "start": 28.9, "end": 46.2}, # Balanced Day
    {"image": "image4.png", "start": 46.2, "end": 52.2}  # CTA
]

# Build video segments
for i, seg in enumerate(segments, 1):
    duration = seg["end"] - seg["start"]
    input_img = DIR / seg["image"]
    output_vid = DIR / f"seg{i}.mp4"
    
    # Create video with Ken Burns zoom effect
    cmd = [
        "ffmpeg", "-y", "-loop", "1", "-i", str(input_img),
        "-t", str(duration),
        "-vf", f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(1+0.001*on,1.1)':d={int(duration*25)}:s=1080x1920:fps=25",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(output_vid)
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"Created segment {i}")

# Concatenate segments
filelist = DIR / "concat.txt"
with open(filelist, "w") as f:
    for i in range(1, 5):
        f.write(f"file 'seg{i}.mp4'\n")

base_video = DIR / "base.mp4"
subprocess.run([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0",
    "-i", str(filelist), "-c", "copy", str(base_video)
], check=True, capture_output=True)
print("Concatenated segments")

# Add audio
audio = DIR / "nandos-2000cal-voiceover.mp3"
with_audio = DIR / "with-audio-final.mp4"
subprocess.run([
    "ffmpeg", "-y", "-i", str(base_video), "-i", str(audio),
    "-c:v", "copy", "-c:a", "aac", "-shortest", str(with_audio)
], check=True, capture_output=True)
print("Added audio")

# Since we can't add text overlays with this ffmpeg, 
# let's just use the version with audio as final
final = DIR / "nandos-2000cal-final.mp4"
subprocess.run(["cp", str(with_audio), str(final)], check=True)
print(f"Final video created: {final}")
print("Note: Text overlays not available with this ffmpeg build.")
print("Video has images + voiceover. Consider adding captions in TikTok/IG editor.")
