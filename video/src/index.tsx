import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FitSortedPromo, MealItem } from './FitSortedPromo';

// Default meals for preview/testing
const defaultMeals: MealItem[] = [
  { name: 'Eggs on toast', calories: 350, time: 'Breakfast', img: 'food/eggs-toast.png' },
  { name: 'Nu Large Nutter', calories: 800, time: 'Mid-morning', img: 'food/nu-nutter.png' },
  { name: 'Woolworths Chicken Salad', calories: 280, time: 'Lunch', img: 'food/chicken-salad.png' },
  { name: 'Biltong (50g)', calories: 206, time: 'Snack', img: 'food/biltong.png' },
  { name: 'Chicken stir fry + rice', calories: 520, time: 'Dinner', img: 'food/stir-fry.png' },
];

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FitSortedPromo"
        component={FitSortedPromo}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "What 2000 calories\nactually looks like",
          goalCalories: 2000,
          meals: defaultMeals,
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
