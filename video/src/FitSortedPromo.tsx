import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

const DARK_BG = '#0f172a';
const GREEN = '#22c55e';
const RED = '#ef4444';

export interface MealItem {
  name: string;
  calories: number;
  time: string;
  img: string;
}

export interface FitSortedPromoProps {
  title?: string;
  goalCalories?: number;
  meals: MealItem[];
}

// Scene 1: Logo and Title (0-3s = 0-90 frames)
const Scene1: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 1 * fps,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <div style={{ opacity: fadeIn, textAlign: 'center' }}>
        <div style={{ fontSize: 80, fontWeight: 900, color: GREEN, marginBottom: 40, fontFamily: 'Inter, sans-serif' }}>
          FitSorted
        </div>
        <div style={{ fontSize: 48, fontWeight: 700, color: 'white', lineHeight: 1.3, fontFamily: 'Inter, sans-serif' }}>
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Food Items (3-7s = 90-210 frames)
const Scene2: React.FC<{ meals: MealItem[] }> = ({ meals }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, padding: 60, justifyContent: 'center' }}>
      {meals.map((item, index) => {
        const startFrame = index * 36; // Stagger by ~1.2s each
        const localFrame = frame - startFrame;
        
        const slideIn = spring({
          frame: localFrame,
          fps,
          config: { damping: 15, stiffness: 200 },
        });
        
        const translateX = interpolate(slideIn, [0, 1], [200, 0], {
          extrapolateRight: 'clamp',
        });
        
        const opacity = interpolate(localFrame, [0, 10], [0, 1], {
          extrapolateRight: 'clamp',
          extrapolateLeft: 'clamp',
        });

        return (
          <div
            key={index}
            style={{
              transform: `translateX(${translateX}px)`,
              opacity,
              marginBottom: 24,
              fontFamily: 'Inter, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <Img
              src={staticFile(item.img)}
              style={{
                width: 100,
                height: 100,
                borderRadius: 16,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#94a3b8', marginBottom: 2 }}>
                {item.time}
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, color: 'white' }}>
                {item.name}
              </div>
            </div>
            <div style={{ color: GREEN, fontSize: 40, fontWeight: 800, flexShrink: 0 }}>
              {item.calories}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Scene 3: Running Total (7-10s = 210-300 frames)
const Scene3: React.FC<{ meals: MealItem[], goalCalories: number }> = ({ meals, goalCalories }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const difference = totalCalories - goalCalories;
  const isOver = difference > 0;
  
  const counterProgress = spring({
    frame,
    fps,
    config: { damping: 100 },
    durationInFrames: 1.5 * fps,
  });
  
  const currentCount = Math.floor(interpolate(counterProgress, [0, 1], [0, totalCalories]));
  
  const fadeInText = spring({
    frame: frame - fps,
    fps,
    config: { damping: 200 },
  });

  const getMessage = () => {
    if (isOver) {
      return (
        <>
          That's already <span style={{ color: RED }}>{Math.abs(difference)} over</span> your goal<br />
          and it felt like a normal day
        </>
      );
    } else {
      return (
        <>
          That's <span style={{ color: GREEN }}>{Math.abs(difference)} under</span> your goal<br />
          You're right on track!
        </>
      );
    }
  };

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 120, fontWeight: 900, color: isOver ? RED : GREEN, marginBottom: 40, fontFamily: 'Inter, sans-serif' }}>
          {currentCount}
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, color: 'white', marginBottom: 20, fontFamily: 'Inter, sans-serif' }}>
          calories
        </div>
        <div style={{ opacity: fadeInText, fontSize: 40, fontWeight: 700, color: 'white', lineHeight: 1.4, fontFamily: 'Inter, sans-serif' }}>
          {getMessage()}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Bold Statement (10-13s = 300-390 frames)
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const fadeIn = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 1 * fps,
  });
  
  const scale = spring({
    frame,
    fps,
    config: { damping: 12 },
    durationInFrames: 0.8 * fps,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, justifyContent: 'center', alignItems: 'center', padding: 60 }}>
      <div style={{ 
        opacity: fadeIn, 
        transform: `scale(${scale})`,
        textAlign: 'center', 
        fontSize: 56, 
        fontWeight: 900, 
        color: 'white', 
        lineHeight: 1.3,
        fontFamily: 'Inter, sans-serif',
      }}>
        Most people have<br />
        <span style={{ color: GREEN }}>NO idea</span><br />
        where they stand
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: CTA (13-15s = 390-450 frames)
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const slideUp = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 1 * fps,
  });
  
  const translateY = interpolate(slideUp, [0, 1], [100, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', padding: 60 }}>
      <div style={{ transform: `translateY(${translateY}px)`, textAlign: 'center' }}>
        <div style={{ fontSize: 60, fontWeight: 900, color: DARK_BG, marginBottom: 40, fontFamily: 'Inter, sans-serif' }}>
          Track every meal<br />on WhatsApp
        </div>
        <div style={{ fontSize: 80, fontWeight: 900, color: DARK_BG, fontFamily: 'Inter, sans-serif' }}>
          📱
        </div>
        <div style={{ fontSize: 48, fontWeight: 700, color: DARK_BG, marginTop: 40, fontFamily: 'Inter, sans-serif' }}>
          fitsorted.co.za
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Main Composition
export const FitSortedPromo: React.FC<FitSortedPromoProps> = ({ 
  title = "What 2000 calories\nactually looks like",
  goalCalories = 2000,
  meals,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={3 * fps} premountFor={fps}>
        <Scene1 title={title} />
      </Sequence>
      <Sequence from={3 * fps} durationInFrames={7 * fps} premountFor={fps}>
        <Scene2 meals={meals} />
      </Sequence>
      <Sequence from={10 * fps} durationInFrames={4 * fps} premountFor={fps}>
        <Scene3 meals={meals} goalCalories={goalCalories} />
      </Sequence>
      <Sequence from={14 * fps} durationInFrames={3 * fps} premountFor={fps}>
        <Scene4 />
      </Sequence>
      <Sequence from={17 * fps} durationInFrames={3 * fps} premountFor={fps}>
        <Scene5 />
      </Sequence>
    </AbsoluteFill>
  );
};
