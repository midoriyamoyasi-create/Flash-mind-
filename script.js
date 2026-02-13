// ====== データモデルと初期設定 ======
let cards = JSON.parse(localStorage.getItem('gentle_cards')) || [];
let settings = JSON.parse(localStorage.getItem('gentle_settings')) || {
  isPro: false,
  studyTime: '20:00',
  sessionSize: 10
};

// セッション状態
let sessionQueue = [];
let currentCard = null;
let isShowingAnswer = false;

// ====== 初期化 ======
function init() {
  updateHomeStats();
  renderLibrary();
  applySettings();
  
  // 今日の日付が変わっているかチェックして通知設定などを準備
  checkNotifications();
}

// ====== ユーティリティ ======
function saveCards() {
  localStorage.setItem('gentle_cards', JSON.stringify(cards));
  updateHomeStats();
  renderLibrary();
}

function saveSettings() {
  settings.studyTime = document.getElementById('study-time').value;
  localStorage.setItem('gentle_settings', JSON.stringify(settings));
}

// 日付を「今日」「明日」などで表示する関数
function formatRelativeDate(isoString) {
  const target = new Date(isoString);
  const today = new Date();
  
  // 時間をリセットして日数差のみを計算
  target.setHours(0,0,0,0);
  today.setHours(0,0,0,0);
  
  const diffTime = target - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "今日";
  if (diffDays === 1) return "明日";
  return `${diffDays}日後`;
}

// ====== ナビゲーション ======
function switchTab(tabId) {
  // すべてのビューを隠す
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#bottom-nav button').forEach(el => el.classList.remove('active'));
  
  // 選択されたビューを表示
  document.getElementById(`view-${tabId}`).classList.add('active');
  document.getElementById(`nav-${tabId}`).classList.add('active');
  
  if (tabId === 'home') updateHomeStats();
}

// ====== ホーム画面とセッション管理 ======
function updateHomeStats() {
  const today = new Date().toISOString();
  const dueCards = cards.filter(c => c.nextReview <= today);
  
  const limit = settings.isPro ? cards.length : Math.min(cards.length, 30);
  document.getElementById('card-limit-text').innerText = `${cards.length} / ${settings.isPro ? '500' : '30'} 枚 (${settings.isPro ? 'Pro版' : '無料版'})`;
  
  if (dueCards.length === 0) {
    document.getElementById('due-count-text').innerText = "今日の復習はすべて終わりました。ゆっくり休みましょう。";
    document.getElementById('start-btn').innerText = "無理せず休む";
    document.getElementById('start-btn').disabled = true;
    document.getElementById('start-btn').style.opacity = "0.5";
  } else {
    document.getElementById('due-count-text').innerText = `今日は ${dueCards.length} 枚のカードが待っています。`;
    document.getElementById('start-btn').innerText = "学習をはじめる";
    document.getElementById('start-btn').disabled = false;
    document.getElementById('start-btn').style.opacity = "1";
  }
}

function startSession() {
  const today = new Date().toISOString();
  // 復習期日が今日（または過去）のカードを抽出
  let dueCards = cards.filter(c => c.nextReview <= today);
  
  // セッションの枚数を制限（無料版は10枚固定）
  const limit = settings.isPro ? settings.sessionSize : 10;
  sessionQueue = dueCards.slice(0, limit);
  
  if (sessionQueue.length > 0) {
    document.getElementById('bottom-nav').classList.add('hidden'); // 学習中は気が散らないようナビを隠す
    switchTab('session');
    showNextCard();
  }
}

function showNextCard() {
  if (sessionQueue.length === 0) {
    finishSession();
    return;
  }
  
  currentCard = sessionQueue[0];
  isShowingAnswer = false;
  
  document.getElementById('card-content').innerText = currentCard.question;
  document.getElementById('tap-hint').classList.remove('hidden');
  document.getElementById('eval-buttons').classList.add('hidden');
  document.getElementById('progress-text').innerText = `残り ${sessionQueue.length} 枚`;
}

// カードのタップ（反転ではなく内容切り替え）
function toggleCard() {
  if (isShowingAnswer) return; // すでに答えを見ている場合は何もしない
  
  isShowingAnswer = true;
  document.getElementById('card-content').innerText = currentCard.answer;
  document.getElementById('tap-hint').classList.add('hidden');
  
  // 評価ボタンをふわっと表示
  document.getElementById('eval-buttons').classList.remove('hidden');
}

// ====== 簡易版Ankiアルゴリズム (SRS) ======
function evaluateCard(rating) {
  let { interval, ease } = currentCard;
  const today = new Date();
  
  if (rating === 'remembered') {
    // 覚えた：間隔を広げ、セッションから外す
    interval = interval === 0 ? 1 : Math.round(interval * ease);
    ease += 0.15;
    sessionQueue.shift(); // キューから削除
    
    today.setDate(today.getDate() + interval);
    currentCard.nextReview = today.toISOString();
    
  } else if (rating === 'hard') {
    // 微妙：間隔は少しだけ広げるか維持、同じセッションの最後にもう一度
    interval = interval === 0 ? 1 : Math.round(interval * 1.2);
    ease -= 0.15;
    sessionQueue.shift();
    sessionQueue.push(currentCard); // 後でもう一度
    
    // 最終的な次回日時は短めに設定
    let nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);
    currentCard.nextReview = nextDate.toISOString();
    
  } else if (rating === 'forgot') {
    // 忘れた：間隔を1にリセット、同じセッションの最後にもう一度
    interval = 1;
    ease -= 0.2;
    if (ease < 1.3) ease = 1.3; // 下限
    sessionQueue.shift();
    sessionQueue.push(currentCard); // 後でもう一度
    
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    currentCard.nextReview = tomorrow.toISOString();
  }

  // カードデータを更新
  currentCard.interval = interval;
  currentCard.ease = ease;
  currentCard.lastReview = new Date().toISOString();
  
  saveCards();
  
  // 強制せず、提案ダイアログを出す
  document.getElementById('proposal-overlay').classList.remove('hidden');
}

// 提案ダイアログのアクション
function continueSession() {
  document.getElementById('proposal-overlay').classList.add('hidden');
  showNextCard();
}

function askEndSession() {
  document.getElementById('proposal-overlay').classList.remove('hidden');
}

function endSession() {
  document.getElementById('proposal-overlay').classList.add('hidden');
  finishSession();
}

function finishSession() {
  document.getElementById('bottom-nav').classList.remove('hidden');
  switchTab('home');
  // 残ったキューはそのまま次回に持ち越し
  sessionQueue = [];
}

// ====== カード庫管理 ======
function addCard() {
  const maxCards = settings.isPro ? 500 : 30;
  if (cards.length >= maxCards) {
    alert(settings.isPro ? 
      "カードが500枚に達しました。" : 
      "無料版では30枚まで保存できます。もしよければ、設定からPro版をご検討ください。");
    return;
  }

  const q = document.getElementById('new-q').value.trim();
  const a = document.getElementById('new-a').value.trim();
  
  if (!q || !a) return;

  const newCard = {
    id: Date.now().toString(),
    question: q,
    answer: a,
    tags: [],
    deck: "default",
    lastReview: null,
    nextReview: new Date().toISOString(), // 最初は「今日」
    interval: 0,
    ease: 2.5
  };

  cards.push(newCard);
  saveCards();
  
  document.getElementById('new-q').value = '';
  document.getElementById('new-a').value = '';
}

function renderLibrary() {
  const list = document.getElementById('card-list');
  list.innerHTML = '';
  
  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'card-list-item';
    div.innerHTML = `
      <div class="date-badge">次回: ${formatRelativeDate(card.nextReview)}</div>
      <div><strong>Q:</strong> ${card.question}</div>
      <div class="hint-text" style="margin-top:4px;"><strong>A:</strong> ${card.answer}</div>
    `;
    list.appendChild(div);
  });
}

// ====== Pro版と設定 ======
function upgradeToPro() {
  // ※実際の決済は実装せず、フラグだけを切り替えます
  settings.isPro = true;
  saveSettings();
  
  alert("ありがとうございます！Pro版の機能が解放されました。これからもあなたの学習を応援しています。");
  
  document.getElementById('upgrade-btn').innerText = "Pro版で応援済みです";
  document.getElementById('upgrade-btn').disabled = true;
  updateHomeStats();
}

function applySettings() {
  document.getElementById('study-time').value = settings.studyTime;
  if (settings.isPro) {
    document.getElementById('upgrade-btn').innerText = "Pro版で応援済みです";
    document.getElementById('upgrade-btn').disabled = true;
  }
}

// 簡易通知要求
function requestNotification() {
  if (!("Notification" in window)) {
    alert("お使いのブラウザは通知に対応していません。");
  } else if (Notification.permission === "granted") {
    alert("すでに通知は許可されています。時間になるとお知らせします。");
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        alert("通知を許可しました！");
      }
    });
  }
}

function checkNotifications() {
  // ブラウザを開いている間に時間が来たら通知を出すための簡易タイマー
  setInterval(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    if (currentTime === settings.studyTime && now.getSeconds() === 0) {
      if (Notification.permission === "granted") {
        new Notification("学習の時間です", { body: "無理のない範囲で、少しだけ進めてみませんか？" });
      }
    }
  }, 1000);
}

// アプリ起動
init();

