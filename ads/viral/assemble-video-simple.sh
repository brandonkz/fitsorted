#!/bin/bash

DIR="/Users/brandonkatz/.openclaw/workspace/fitsorted/ads/viral"
AUDIO="$DIR/nandos-2000cal-voiceover.mp3"
OUTPUT="$DIR/nandos-2000cal-simple.mp4"

# Duration: ~52 seconds, split into 4 images = ~13 seconds each
DURATION=13

# Create a video from each image with Ken Burns zoom effect
for i in 1 2 3 4; do
  ffmpeg -y -loop 1 -i "$DIR/image$i.png" -t $DURATION -vf "\
    scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,\
    zoompan=z='min(zoom+0.0015,1.2)':d=$DURATION*25:s=1080x1920:fps=25" \
    -c:v libx264 -pix_fmt yuv420p "$DIR/segment$i.mp4"
done

# Concatenate the segments
echo "file 'segment1.mp4'" > "$DIR/filelist.txt"
echo "file 'segment2.mp4'" >> "$DIR/filelist.txt"
echo "file 'segment3.mp4'" >> "$DIR/filelist.txt"
echo "file 'segment4.mp4'" >> "$DIR/filelist.txt"

ffmpeg -y -f concat -safe 0 -i "$DIR/filelist.txt" -c copy "$DIR/base-video.mp4"

# Add audio
ffmpeg -y -i "$DIR/base-video.mp4" -i "$AUDIO" -c:v copy -c:a aac -shortest "$DIR/with-audio.mp4"

# Add captions and overlay
ffmpeg -y -i "$DIR/with-audio.mp4" -vf "\
drawtext=text='What 2,000 Calories Looks Like at Nando'\''s 🍗':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=50:\
fontcolor=white:borderw=3:bordercolor=black:\
x=(w-text_w)/2:y=80:enable='between(t,0,52)',\
\
drawtext=text='THE TRAP':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=70:\
fontcolor=yellow:borderw=4:bordercolor=black:\
x=(w-text_w)/2:y=h-400:enable='between(t,6.7,15.5)',\
\
drawtext=text='1,800 calories in one meal':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=50:\
fontcolor=white:borderw=3:bordercolor=black:\
x=(w-text_w)/2:y=h-300:enable='between(t,10.8,15.5)',\
\
drawtext=text='THE SMART ORDER':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=70:\
fontcolor=lime:borderw=4:bordercolor=black:\
x=(w-text_w)/2:y=h-400:enable='between(t,15.5,28.9)',\
\
drawtext=text='480 calories - Same restaurant!':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=50:\
fontcolor=white:borderw=3:bordercolor=black:\
x=(w-text_w)/2:y=h-300:enable='between(t,22.7,28.9)',\
\
drawtext=text='3 MEALS = 2,000 CALORIES':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=70:\
fontcolor=cyan:borderw=4:bordercolor=black:\
x=(w-text_w)/2:y=h-400:enable='between(t,31.3,46.2)',\
\
drawtext=text='Breakfast (400) + Lunch (480) + Dinner (520)':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=45:\
fontcolor=white:borderw=3:bordercolor=black:\
x=(w-text_w)/2:y=h-300:enable='between(t,35.4,46.2)',\
\
drawtext=text='Track calories in 5 seconds':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=65:\
fontcolor=white:borderw=4:bordercolor=black:\
x=(w-text_w)/2:y=h-500:enable='between(t,47.2,52)',\
\
drawtext=text='FitSorted on WhatsApp':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=55:\
fontcolor=lime:borderw=3:bordercolor=black:\
x=(w-text_w)/2:y=h-400:enable='between(t,49.3,52)',\
\
drawtext=text='Link in bio':\
fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:fontsize=50:\
fontcolor=white:borderw=3:bordercolor=black:\
x=(w-text_w)/2:y=h-300:enable='between(t,51.2,52)',\
\
drawbox=y=0:color=black@0.3:width=iw:height=ih:t=fill" \
-c:a copy "$OUTPUT"

echo "Simple version created: $OUTPUT"
