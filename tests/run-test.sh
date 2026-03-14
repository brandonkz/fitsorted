#!/bin/bash
# Round 9 edge case testing
OPENAI_KEY="${OPENAI_API_KEY:-$(grep OPENAI_API_KEY /Users/brandonkatz/.openclaw/workspace/fitsorted/.env | cut -d= -f2)}"

SYSTEM_PROMPT='You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nandos quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says scrambled, return scrambled eggs ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says toast, return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: egg = 1 egg (~70 cal), eggs = 2 eggs (~140 cal). slice of toast = 1 slice, toast = 2 slices. banana = 1 banana. chicken breast = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. two, three, 2x, 3 slices), multiply the calories AND macros accordingly and include the quantity in the food name. Example: two toasted cheese sandwiches -> {"food": "2x toasted cheese sandwich", "calories": 800, "protein": 30, "carbs": 80, "fat": 35, "fibre": 4, "estimatedPriceZAR": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). No extra text.'

RESULTS_FILE="/Users/brandonkatz/.openclaw/workspace/fitsorted/tests/test-results.jsonl"
> "$RESULTS_FILE"

test_food() {
  local food="$1"
  local min_cal="$2"
  local max_cal="$3"
  
  local response=$(curl -s https://api.openai.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_KEY" \
    -d "{
      \"model\": \"gpt-4o-mini\",
      \"messages\": [
        {\"role\": \"system\", \"content\": $(echo "$SYSTEM_PROMPT" | jq -Rs .)},
        {\"role\": \"user\", \"content\": $(echo "$food" | jq -Rs .)}
      ],
      \"temperature\": 0.3
    }")
  
  local content=$(echo "$response" | jq -r '.choices[0].message.content // "ERROR"')
  local calories=$(echo "$content" | jq -r '.calories // -1' 2>/dev/null)
  
  if [ "$calories" = "-1" ] || [ "$calories" = "null" ]; then
    # Try extracting from text
    calories=$(echo "$content" | grep -o '"calories":[[:space:]]*[0-9]*' | grep -o '[0-9]*')
    if [ -z "$calories" ]; then
      calories=-1
    fi
  fi
  
  local status="PASS"
  if [ "$calories" -lt "$min_cal" ] 2>/dev/null || [ "$calories" -gt "$max_cal" ] 2>/dev/null; then
    status="FAIL"
  fi
  if [ "$calories" = "-1" ]; then
    status="ERROR"
  fi
  
  echo "{\"food\":\"$food\",\"min\":$min_cal,\"max\":$max_cal,\"calories\":$calories,\"status\":\"$status\"}" >> "$RESULTS_FILE"
  echo "$status | $food | expected=$min_cal-$max_cal | got=$calories"
}

# Read all test cases from combined file
COMBINED="/Users/brandonkatz/.openclaw/workspace/fitsorted/tests/combined-tests.json"

count=$(jq length "$COMBINED")
echo "Testing $count items..."

for i in $(seq 0 $(($count - 1))); do
  food=$(jq -r ".[$i][0]" "$COMBINED")
  min=$(jq -r ".[$i][1]" "$COMBINED")
  max=$(jq -r ".[$i][2]" "$COMBINED")
  test_food "$food" "$min" "$max"
  
  # Rate limit: pause every 5 requests
  if [ $(( ($i + 1) % 5 )) -eq 0 ]; then
    sleep 1
  fi
done

echo "Done! Results in $RESULTS_FILE"
