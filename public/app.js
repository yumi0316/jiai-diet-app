// ─── 状態管理 ───────────────────────────────────────────
let currentStep = 1;
let mealPlanData = null;
let currentDay = 0;

const tips = [
  '食べることを楽しむことが、続けるための一番の秘訣です。',
  '完璧じゃなくていい。今日できることをやるだけで十分です。',
  '自分を愛することから始まる食事は、心も体も豊かにします。',
  '「食べすぎた」と思っても、次の食事からリセットすればOK！',
  '野菜を一品追加するだけでも、大きな変化になります。',
  '美味しいご飯を食べている時間は、最高の自愛時間です。',
];

// ─── ステップ遷移 ─────────────────────────────────────────
function goToStep(step) {
  if (step > currentStep && !validateCurrentStep()) return;

  document.getElementById(`step${currentStep}`).classList.add('hidden');
  document.getElementById(`step${step}`).classList.remove('hidden');

  // ステップドット更新
  document.getElementById(`stepDot${currentStep}`).classList.remove('active');
  document.getElementById(`stepDot${currentStep}`).classList.add('completed');
  document.getElementById(`stepDot${step}`).classList.add('active');
  document.getElementById(`stepDot${step}`).classList.remove('completed');

  if (step < currentStep) {
    document.getElementById(`stepDot${step}`).classList.remove('completed');
    for (let i = step + 1; i <= 3; i++) {
      const dot = document.getElementById(`stepDot${i}`);
      dot.classList.remove('active', 'completed');
    }
  }

  currentStep = step;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── バリデーション ────────────────────────────────────────
function validateCurrentStep() {
  if (currentStep === 1) {
    const age = document.getElementById('age').value;
    const height = document.getElementById('height').value;
    const weight = document.getElementById('weight').value;

    if (!age || age < 15 || age > 80) {
      alert('年齢を正しく入力してください（15〜80歳）');
      return false;
    }
    if (!height || height < 140 || height > 200) {
      alert('身長を正しく入力してください（140〜200cm）');
      return false;
    }
    if (!weight || weight < 30 || weight > 200) {
      alert('体重を正しく入力してください（30〜200kg）');
      return false;
    }
  }
  return true;
}

// ─── BMI リアルタイム計算 ────────────────────────────────────
function calcBMI() {
  const height = parseFloat(document.getElementById('height').value);
  const weight = parseFloat(document.getElementById('weight').value);
  const display = document.getElementById('bmiDisplay');

  if (!height || !weight || height < 100 || weight < 20) {
    display.style.display = 'none';
    return;
  }

  const bmi = (weight / ((height / 100) ** 2)).toFixed(1);
  let category = '';
  if (bmi < 18.5) category = '低体重';
  else if (bmi < 25) category = '普通体重';
  else if (bmi < 30) category = '肥満（1度）';
  else category = '肥満（2度以上）';

  document.getElementById('bmiValue').textContent = bmi;
  document.getElementById('bmiCategory').textContent = category;
  display.style.display = 'flex';
}

document.getElementById('height').addEventListener('input', calcBMI);
document.getElementById('weight').addEventListener('input', calcBMI);

// ─── 食事プラン生成 ───────────────────────────────────────────
async function generateMealPlan() {
  if (!validateCurrentStep()) return;

  const params = {
    gender: document.querySelector('input[name="gender"]:checked').value,
    age: parseInt(document.getElementById('age').value),
    height: parseInt(document.getElementById('height').value),
    weight: parseFloat(document.getElementById('weight').value),
    mealStyle: document.querySelector('input[name="mealStyle"]:checked').value,
    preferences: document.getElementById('preferences').value.trim(),
    dislikes: document.getElementById('dislikes').value.trim(),
    allergies: document.getElementById('allergies').value.trim(),
    goal: document.querySelector('input[name="goal"]:checked').value,
  };

  // ステップを隠してローディング表示
  document.getElementById('step3').classList.add('hidden');
  document.getElementById('stepsIndicator').classList.add('hidden');
  document.getElementById('loadingSection').classList.remove('hidden');

  // ヒントをローテーション
  let tipIndex = 0;
  const tipEl = document.getElementById('tipText');
  const tipInterval = setInterval(() => {
    tipIndex = (tipIndex + 1) % tips.length;
    tipEl.style.opacity = '0';
    setTimeout(() => {
      tipEl.textContent = tips[tipIndex];
      tipEl.style.opacity = '1';
    }, 300);
  }, 4000);

  tipEl.style.transition = 'opacity 0.3s';

  await fetchMealPlan(params, tipInterval, 0);
}

async function fetchMealPlan(params, tipInterval, retryCount) {
  try {
    const res = await fetch('/api/generate-meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.type === 'ping') continue;
        if (data.type === 'progress') {
          document.getElementById('loadingFill').style.width = data.progress + '%';
          document.getElementById('loadingMsg').textContent = `レシピを生成中... ${data.progress}%`;
          continue;
        }
        if (data.type === 'result') {
          clearInterval(tipInterval);
          mealPlanData = data.data;
          document.getElementById('loadingSection').classList.add('hidden');
          renderResult(mealPlanData, params);
          return;
        }
        if (data.type === 'error') {
          throw new Error(data.error);
        }
      }
    }
  } catch (err) {
    // 1回目のエラーは自動でリトライ
    if (retryCount === 0) {
      document.getElementById('loadingMsg').textContent = 'サーバーを起動中です。自動的に再試行しています...';
      await new Promise(resolve => setTimeout(resolve, 4000));
      document.getElementById('loadingMsg').textContent = 'AIがレシピを考えています...';
      return fetchMealPlan(params, tipInterval, 1);
    }

    // 2回失敗したらエラー表示
    clearInterval(tipInterval);
    document.getElementById('loadingSection').classList.add('hidden');
    document.getElementById('step3').classList.remove('hidden');
    document.getElementById('stepsIndicator').classList.remove('hidden');
    alert(`エラーが発生しました: ${err.message}\n\nもう一度お試しください。`);
  }
}

// ─── 結果レンダリング ───────────────────────────────────────
function renderResult(data, params) {
  const resultSection = document.getElementById('resultSection');
  resultSection.classList.remove('hidden');

  // プロフィールサマリー
  const bmiVal = ((params.weight / ((params.height / 100) ** 2)).toFixed(1));
  document.getElementById('profileSummary').innerHTML = `
    <div class="profile-summary-grid">
      <div class="profile-stat">
        <span class="profile-stat-label">BMI</span>
        <span class="profile-stat-value">${data.profile.bmi}</span>
        <span class="profile-stat-unit">${data.profile.bmiCategory}</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-label">目標カロリー</span>
        <span class="profile-stat-value">${data.profile.dailyCalories.toLocaleString()}</span>
        <span class="profile-stat-unit">kcal/日</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-label">プラン期間</span>
        <span class="profile-stat-value">7</span>
        <span class="profile-stat-unit">日間</span>
      </div>
    </div>
    <div class="ai-message">🌸 ${data.profile.message}</div>
  `;

  // 曜日タブ生成
  const tabsEl = document.getElementById('dayTabs');
  tabsEl.innerHTML = '';
  data.weekPlan.forEach((day, i) => {
    const tab = document.createElement('button');
    tab.className = 'day-tab' + (i === 0 ? ' active' : '');
    tab.textContent = day.day;
    tab.onclick = () => switchDay(i);
    tabsEl.appendChild(tab);
  });

  // 食事パネル生成
  const mealsEl = document.getElementById('mealsContainer');
  mealsEl.innerHTML = '';
  mealsEl.style.display = 'block';

  data.weekPlan.forEach((day, dayIndex) => {
    const panel = document.createElement('div');
    panel.className = 'day-panel' + (dayIndex === 0 ? ' active' : '');
    panel.id = `dayPanel${dayIndex}`;

    const mealTypes = [
      { key: 'breakfast', label: '朝食', icon: '🌅', badgeClass: 'badge-breakfast' },
      { key: 'lunch', label: '昼食', icon: '☀️', badgeClass: 'badge-lunch' },
      { key: 'dinner', label: '夕食', icon: '🌙', badgeClass: 'badge-dinner' },
    ];

    const mealCardsHTML = mealTypes.map(type => {
      const meal = day[type.key];
      if (!meal) return '';
      return `
        <div class="meal-card">
          <div class="meal-card-header" onclick="openModal(${dayIndex}, '${type.key}')">
            <span class="meal-type-badge ${type.badgeClass}">${type.icon} ${type.label}</span>
            <div class="meal-card-info">
              <div class="meal-name">${meal.name}</div>
              <div class="meal-meta">
                <span class="meal-cal">🔥 ${meal.calories}kcal</span>
                <span class="meal-time">⏱ ${meal.time}</span>
              </div>
            </div>
            <button class="meal-expand-btn">レシピ →</button>
          </div>
          <div class="meal-description">${meal.description}</div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="day-theme-bar">
        <span class="day-theme-icon">✨</span>
        <div class="day-theme-text">
          <div class="day-theme-title">${day.theme || day.day}</div>
          <div class="day-love-msg">💗 ${day.selfLoveMessage || ''}</div>
        </div>
      </div>
      <div class="meal-cards">${mealCardsHTML}</div>
    `;

    mealsEl.appendChild(panel);
  });

  currentDay = 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── 曜日切替 ─────────────────────────────────────────────
function switchDay(index) {
  const tabs = document.querySelectorAll('.day-tab');
  const panels = document.querySelectorAll('.day-panel');

  tabs.forEach((t, i) => t.classList.toggle('active', i === index));
  panels.forEach((p, i) => p.classList.toggle('active', i === index));

  currentDay = index;
}

// ─── レシピモーダル ────────────────────────────────────────
function openModal(dayIndex, mealKey) {
  const day = mealPlanData.weekPlan[dayIndex];
  const meal = day[mealKey];
  if (!meal) return;

  const mealLabels = { breakfast: '朝食', lunch: '昼食', dinner: '夕食' };
  const mealIcons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };

  const ingredientsHTML = Array.isArray(meal.ingredients)
    ? meal.ingredients.map(ing => `<li>${ing}</li>`).join('')
    : `<li>${meal.ingredients}</li>`;

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-meal-type">${mealIcons[mealKey]} ${mealLabels[mealKey]}｜${day.day}</div>
    <div class="modal-meal-name">${meal.name}</div>
    <div class="modal-meal-stats">
      <span>🔥 ${meal.calories}kcal</span>
      <span>⏱ ${meal.time}</span>
    </div>
    <div class="modal-description">"${meal.description}"</div>

    <div class="modal-section-title">🛒 材料</div>
    <ul class="ingredients-list">${ingredientsHTML}</ul>

    <div class="modal-section-title">👩‍🍳 作り方</div>
    <div class="recipe-steps">${meal.recipe}</div>
  `;

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ─── 印刷 ──────────────────────────────────────────────────
function printPlan() {
  window.print();
}

// ─── リセット ─────────────────────────────────────────────
function resetForm() {
  if (!confirm('新しい食事プランを作りますか？')) return;

  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('stepsIndicator').classList.remove('hidden');
  document.getElementById('step1').classList.remove('hidden');
  document.getElementById('step2').classList.add('hidden');
  document.getElementById('step3').classList.add('hidden');

  // ステップリセット
  ['stepDot1', 'stepDot2', 'stepDot3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'completed');
    if (i === 0) el.classList.add('active');
  });

  // フォームリセット
  document.getElementById('age').value = '';
  document.getElementById('height').value = '';
  document.getElementById('weight').value = '';
  document.getElementById('preferences').value = '';
  document.getElementById('dislikes').value = '';
  document.getElementById('allergies').value = '';
  document.getElementById('bmiDisplay').style.display = 'none';
  document.querySelector('input[name="gender"][value="female"]').checked = true;
  document.querySelector('input[name="mealStyle"][value="japanese"]').checked = true;
  document.querySelector('input[name="goal"][value="maintain"]').checked = true;

  currentStep = 1;
  mealPlanData = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
