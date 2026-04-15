#!/bin/bash
ITEMS=(
"dischem whey protein|120|180"
"spur chicken wings 8 piece|650|900"
"pick n pay samoosa 4|350|550"
"ocean basket grilled calamari|450|650"
"rocomamas loaded burger|750|1000"
"woolworths chicken lasagne|400|600"
"kfc zinger burger|450|600"
"galitos quarter chicken|400|550"
"mugg and bean chicken wrap|450|650"
"stoney ginger beer 500ml|180|280"
)

for item in "${ITEMS[@]}"; do
  IFS='|' read -r food minCal maxCal <<< "$item"
  result=$(curl -s -X POST https://api.openai.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d "{
      \"model\": \"gpt-4o-mini\",
      \"messages\": [
        {\"role\": \"system\", \"content\": \"You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {\\\"food\\\": \\\"clean name\\\", \\\"calories\\\": integer, \\\"protein\\\": integer, \\\"carbs\\\": integer, \\\"fat\\\": integer, \\\"fibre\\\": integer}. No extra text.\"},
        {\"role\": \"user\", \"content\": \"Nutrition for: $food\"}
      ],
      \"temperature\": 0.2
    }" | jq -r '.choices[0].message.content')
  echo "$food|$minCal|$maxCal|$result"
done
