#!/bin/bash

API_KEY="AIzaSyAVrcvQwkwrPMDQ0hGu-JzUFI9mLihc0IU"
DIR="/Users/brandonkatz/.openclaw/workspace/fitsorted/ads/viral"

# Image 1: The Trap
echo "Generating image 1..."
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{
      "prompt": "Nandos espetada with chips and Coke on a dark table, overhead shot, dramatic lighting, food photography, vertical 9:16 ratio"
    }],
    "parameters": {
      "sampleCount": 1,
      "aspectRatio": "9:16"
    }
  }' 2>/dev/null | jq -r '.predictions[0].bytesBase64Encoded' | base64 -d > "$DIR/image1.png"

# Image 2: The Smart Order
echo "Generating image 2..."
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{
      "prompt": "Nandos grilled quarter chicken breast with Mediterranean salad, healthy, clean plate, dark background, overhead food photography, vertical 9:16"
    }],
    "parameters": {
      "sampleCount": 1,
      "aspectRatio": "9:16"
    }
  }' 2>/dev/null | jq -r '.predictions[0].bytesBase64Encoded' | base64 -d > "$DIR/image2.png"

# Image 3: The Balanced Day
echo "Generating image 3..."
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{
      "prompt": "Three Nandos meals laid out on dark table, breakfast wrap, quarter chicken lunch, chicken strips dinner, overhead shot, food photography, vertical 9:16"
    }],
    "parameters": {
      "sampleCount": 1,
      "aspectRatio": "9:16"
    }
  }' 2>/dev/null | jq -r '.predictions[0].bytesBase64Encoded' | base64 -d > "$DIR/image3.png"

# Image 4: CTA
echo "Generating image 4..."
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{
      "prompt": "Bold text 2000 CALORIES with Nandos flame-grilled chicken in background, dark dramatic, social media style, vertical 9:16"
    }],
    "parameters": {
      "sampleCount": 1,
      "aspectRatio": "9:16"
    }
  }' 2>/dev/null | jq -r '.predictions[0].bytesBase64Encoded' | base64 -d > "$DIR/image4.png"

echo "All images generated!"
