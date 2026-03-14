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

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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

async function main() {
  const users = loadUsers();
  let sent = 0;
  let skipped = 0;
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal || !user.joinedAt) {
      skipped++;
      continue;
    }
    
    if (user.sentDay1Motivation) {
      console.log(`⊘ ${phone}: Already sent day 1 message`);
      skipped++;
      continue;
    }
    
    const joinedAt = new Date(user.joinedAt);
    const daysSinceJoin = Math.floor((Date.now() - joinedAt.getTime()) / 86400000);
    
    if (daysSinceJoin !== 1) {
      console.log(`⊘ ${phone}: Day ${daysSinceJoin} (need day 1)`);
      skipped++;
      continue;
    }
    
    try {
      const { gender, weight, height, age, activity } = user.profile || {};
      if (!gender || !weight || !height || !age || !activity) {
        console.log(`⊘ ${phone}: Missing profile data`);
        skipped++;
        continue;
      }
      
      // Calculate TDEE
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
      
      // 7-day projection
      const weekDeficit = dailyDeficit * 7;
      const weekLoss = weekDeficit / 7700;
      const weekWeight = weight - weekLoss;
      
      const name = user.name || "Hey";
      
      let msg = `${name} 👋\n\n`;
      msg += `If you stick to your calorie goals, you'll weigh *${weekWeight.toFixed(1)} kg* in one week.\n\n`;
      msg += `That's *${weekLoss.toFixed(1)} kg* down from where you started.\n\n`;
      msg += `Keep it up 💪`;
      
      const success = await send(phone, msg);
      if (success) {
        users[phone].sentDay1Motivation = true;
        sent++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`Error processing ${phone}:`, err.message);
      skipped++;
    }
  }
  
  saveUsers(users);
  
  console.log(`\n✅ Done!`);
  console.log(`Sent: ${sent}`);
  console.log(`Skipped: ${skipped}`);
}

main();
