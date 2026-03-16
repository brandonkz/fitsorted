# FitSorted Promotional Video

## Overview
Data-driven 20-second vertical video template (1080x1920, 30fps) for Instagram Reels / TikTok promoting FitSorted.

## Video Concept: "What 2000 Calories Looks Like"

### Scenes:
1. **Scene 1 (0-3s)**: FitSorted logo + customizable title fade in
2. **Scene 2 (3-10s)**: Food items sliding in from right with calorie counts (data-driven)
3. **Scene 3 (10-14s)**: Running total counter with smart messaging:
   - Counter turns **red** if over goal, **green** if under
   - Dynamic message based on whether you're over or under
4. **Scene 4 (14-17s)**: "Most people have NO idea where they stand" — bold statement
5. **Scene 5 (17-20s)**: CTA with green background, "Track every meal on WhatsApp" + fitsorted.co.za

### Design:
- Dark background (#0f172a) with green accents (#22c55e)
- Red alerts for over-goal (#ef4444)
- Bold Inter font family
- Spring animations for smooth, natural motion
- Professional, punchy transitions

## Data-Driven Template

The video is now fully data-driven! You can generate different versions by passing in JSON data.

### JSON Format:
```json
{
  "title": "What 2000 calories\nactually looks like",
  "goalCalories": 2000,
  "meals": [
    {
      "name": "Eggs on toast",
      "calories": 350,
      "time": "Breakfast",
      "img": "food/eggs-toast.png"
    },
    ...
  ]
}
```

### Generate Videos:

```bash
# Generate video from JSON data
node scripts/generate-video.js --data examples/day1.json --output out/day1.mp4

# Example: Normal day (slightly over goal)
node scripts/generate-video.js --data examples/day1.json --output out/day1.mp4

# Example: Healthy day (under goal)
node scripts/generate-video.js --data examples/day2.json --output out/day2.mp4

# Example: Weekend braai (way over goal!)
node scripts/generate-video.js --data examples/day3.json --output out/day3.mp4
```

### Example Data Files:
- `examples/day1.json` - Normal day: eggs, Nu Nutter, salad, biltong, stir fry (2156 cal - over goal)
- `examples/day2.json` - Healthy day: oats, fruit, grilled chicken, yoghurt, fish (1580 cal - under goal)
- `examples/day3.json` - Weekend braai: full breakfast, beers, boerewors, steak, malva pudding (3450 cal - way over!)

## Development:

```bash
# Install dependencies
npm install

# Preview in browser (uses default data from index.tsx)
npm start

# Build for production
npm run build
```

## Files:
- **Component**: `src/FitSortedPromo.tsx` - Main composition with all 5 scenes (now accepts props!)
- **Entry**: `src/index.tsx` - Remotion root registration with default data
- **Generator**: `scripts/generate-video.js` - CLI script to render videos from JSON
- **Examples**: `examples/*.json` - Sample data files

## Tech Stack:
- Remotion 4.0.234
- React 18.2.0
- TypeScript 5.3.3
- Spring animations for smooth motion
- Food images in `public/food/` directory

## How It Works:

1. The `FitSortedPromo` component now accepts props: `meals`, `title`, and `goalCalories`
2. It auto-calculates the total calories from your meals array
3. Counter color changes based on whether you're over/under goal
4. Message dynamically adjusts: "156 over your goal" vs "420 under your goal"
5. The generator script bundles the project and renders with your custom data

## Use Cases:

- **Different calorie goals**: Change `goalCalories` (1500, 2000, 2500, etc.)
- **Different meal plans**: Keto, vegan, intermittent fasting, etc.
- **Regional variations**: South African foods, American foods, etc.
- **Success stories**: "This is what kept me under my goal"
- **Reality checks**: "This is what I thought was healthy..."

## Next Steps:

Want to create a batch of videos? Just create more JSON files in `examples/` and run the generator script for each one!
