require("dotenv").config();
const axios = require("axios");
const fs = require("fs");

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const USERS_FILE = "./users.json";

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function send(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    console.log(`✓ Sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send to ${to}:`, err.response?.data || err.message);
    return false;
  }
}

function calculateWeightProjection(user) {
  if (!user.goal || !user.profile || !user.joinedAt) return null;
  
  // Use logged weight if available, otherwise use signup profile weight
  const startWeight = user.weights && user.weights.length > 0 
    ? user.weights[0].kg 
    : user.profile.weight;
  
  if (!startWeight) return null;
  
  const startDate = new Date(user.joinedAt);
  
  // Current weight: latest logged weight or profile weight
  const currentWeight = user.weights && user.weights.length > 0
    ? user.weights[user.weights.length - 1].kg
    : user.profile.weight;
  
  const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / 86400000);
  if (daysSinceStart < 1) return null;
  
  const { gender, weight, height, age, activity } = user.profile;
  if (!gender || !weight || !height || !age || !activity) return null;
  
  let bmr;
  if (gender === "male") {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }
  
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9
  };
  
  const tdee = bmr * (multipliers[activity] || 1.2);
  const dailyDeficit = tdee - user.goal;
  const totalDeficit = dailyDeficit * daysSinceStart;
  const expectedWeightLoss = totalDeficit / 7700;
  const projectedWeight = startWeight - expectedWeightLoss;
  
  return {
    projected: Math.round(projectedWeight * 10) / 10,
    current: currentWeight,
    expectedLoss: Math.round(expectedWeightLoss * 10) / 10,
    daysSinceStart,
    startWeight
  };
}

async function main() {
  const users = loadUsers();
  let sent = 0;
  let skipped = 0;
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) {
      skipped++;
      continue;
    }
    
    const projection = calculateWeightProjection(user);
    
    if (!projection || projection.daysSinceStart < 7) {
      console.log(`⊘ ${phone}: Only ${projection?.daysSinceStart || 0} days since signup`);
      skipped++;
      continue;
    }
    
    const name = user.name || "Hey";
    
    const msg = `Hey ${name} 👋\n\nIf you'd hit your calories every day since you joined, you would have lost *${projection.expectedLoss} kg* by now.\n\nStarting weight: *${projection.startWeight} kg*\nYou'd weigh: *${projection.projected} kg*`;
    
    const success = await send(phone, msg);
    if (success) {
      sent++;
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 sec delay between messages
    }
  }
  
  console.log(`\n✅ Done!`);
  console.log(`Sent: ${sent}`);
  console.log(`Skipped: ${skipped}`);
}

main();
