require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/generate-meal-plan', async (req, res) => {
  const { height, weight, age, gender, preferences, dislikes, allergies, mealStyle, goal } = req.body;

  if (!height || !weight || !age || !gender) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`data: ${JSON.stringify({ type: 'error', error: '身長・体重・年齢・性別は必須です' })}\n\n`);
    return res.end();
  }

  // SSE で接続を維持しながらレスポンスを返す
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 8秒ごとにpingを送って接続を維持
  const heartbeat = setInterval(() => {
    res.write('data: {"type":"ping"}\n\n');
  }, 8000);

  const heightM = height / 100;
  const bmi = (weight / (heightM * heightM)).toFixed(1);

  let bmiCategory;
  if (bmi < 18.5) bmiCategory = '低体重';
  else if (bmi < 25) bmiCategory = '普通体重';
  else if (bmi < 30) bmiCategory = '肥満（1度）';
  else bmiCategory = '肥満（2度以上）';

  let bmr;
  if (gender === 'female') {
    bmr = Math.round(10 * weight + 6.25 * height - 5 * age - 161);
  } else {
    bmr = Math.round(10 * weight + 6.25 * height - 5 * age + 5);
  }

  const tdee = Math.round(bmr * 1.375);

  let targetCalories;
  if (goal === 'lose') targetCalories = Math.round(tdee - 400);
  else if (goal === 'gain') targetCalories = Math.round(tdee + 300);
  else targetCalories = tdee;

  const mealStyleLabel = {
    japanese: '和食中心',
    western: '洋食中心',
    chinese: '中華・アジア系',
    mixed: 'なんでも食べる'
  }[mealStyle] || 'なんでも食べる';

  const goalLabel = {
    lose: '無理なく体重を減らしたい',
    maintain: '今の体重を維持したい',
    gain: '健康的に体重を増やしたい'
  }[goal] || '体重を維持したい';

  const prompt = `あなたは「自愛ダイエット」の栄養コーチです。
自愛ダイエットとは、自分を責めずに愛しながら、楽しく無理なく健康的な食習慣を育てるダイエット法です。

## クライアントのプロフィール
- 性別: ${gender === 'female' ? '女性' : '男性'}
- 年齢: ${age}歳
- 身長: ${height}cm / 体重: ${weight}kg
- BMI: ${bmi}（${bmiCategory}）
- 目標: ${goalLabel}
- 目標カロリー: 1日 ${targetCalories}kcal

## 食の好み・条件
- 食事スタイル: ${mealStyleLabel}
- 好きな食べ物: ${preferences || '特になし'}
- 苦手な食材: ${dislikes || '特になし'}
- アレルギー・除外食材: ${allergies || '特になし'}

## 作成ルール
1. 自愛ダイエットのコンセプトを大切に：食べることを楽しむ、無理しない、自分を責めない
2. 日本のスーパーで手に入る食材を使う
3. 調理時間は朝食10〜15分、昼食・夕食20〜30分以内
4. アレルギー食材は絶対に使わない
5. 苦手な食材も使わない
6. 各日に温かい「自愛メッセージ」を添える

## 出力形式
以下のJSONのみを返してください（説明文・コードブロック不要）:

{
  "profile": {
    "bmi": "${bmi}",
    "bmiCategory": "${bmiCategory}",
    "dailyCalories": ${targetCalories},
    "message": "このクライアントへの温かく励ましのメッセージ（自愛ダイエットの精神で、2〜3文）"
  },
  "weekPlan": [
    {
      "day": "月曜日",
      "theme": "週のテーマ（例：新しいスタートの日）",
      "selfLoveMessage": "今日の自愛メッセージ（優しく短く1文）",
      "breakfast": {
        "name": "料理名",
        "calories": 数字のみ,
        "time": "10分",
        "description": "料理の魅力を伝える一言（食欲がわく表現で）",
        "ingredients": ["食材 量", "食材 量", "食材 量"],
        "recipe": "①手順\\n②手順\\n③手順"
      },
      "lunch": {
        "name": "料理名",
        "calories": 数字のみ,
        "time": "20分",
        "description": "料理の魅力を伝える一言",
        "ingredients": ["食材 量", "食材 量"],
        "recipe": "①手順\\n②手順\\n③手順\\n④手順"
      },
      "dinner": {
        "name": "料理名",
        "calories": 数字のみ,
        "time": "25分",
        "description": "料理の魅力を伝える一言",
        "ingredients": ["食材 量", "食材 量", "食材 量"],
        "recipe": "①手順\\n②手順\\n③手順\\n④手順"
      }
    }
  ]
}

weekPlanは月曜日〜日曜日の7日分を作成してください。`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0].text.trim();

    let mealPlan;
    try {
      mealPlan = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        mealPlan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('レシピの生成に失敗しました。もう一度お試しください。');
      }
    }

    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ type: 'result', success: true, data: mealPlan })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error:', error.message);
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ type: 'error', success: false, error: error.message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌸 自愛ダイエットアプリが起動しました → http://localhost:${PORT}`);
});
