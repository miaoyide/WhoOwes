// --- 請替換以下資訊 ---
const SUPABASE_URL = 'https://naagujwufjeqsgwmyrcv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hYWd1and1ZmplcXNnd215cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjc0MTcsImV4cCI6MjA4ODkwMzQxN30.6MFjNVe2zz1lwGVYx9BSFco7hEZTjvBueGQABrq1apM';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PRESET_MEMBERS = ["ㄉ","ㄊ","ㄌ","ㄐㄅ","ㄅㄐ","ㄌㄇ","ㄩ","ㄏ"]; 

let currentEventId = '';
let expenses = [];
let members = [];
let selectedParticipants = [...members];
let isDeleting = false;
let modalMembers = [];
let titleClickCount = 0;
let titleClickTimer = null;
let editMode = false;

function handleTitleClick() {
    titleClickCount++;
    clearTimeout(titleClickTimer);

    titleClickTimer = setTimeout(() => {
        titleClickCount = 0;
    }, 2000); // 2 秒內要點完 5 下

    if (titleClickCount >= 5) {
        titleClickCount = 0;
        clearTimeout(titleClickTimer);
        toggleEditMode();
    }
}

function toggleEditMode() {
    editMode = !editMode;
    document.body.classList.toggle('edit-mode', editMode);
}

window.onload = async function () {
    document.getElementById('itemDate').value = new Date().toISOString().split('T')[0];
    await fetchEvents(); // 先抓行程列表
    await fetchExpenses(); // 初始載入雲端資料

    // 開啟即時監聽：一旦雲端資料變動，立刻更新畫面
    _supabase.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
            fetchExpenses();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
            fetchEvents();  // ✅ 加這個
        })
        .subscribe();

    render();
};

// 抓取所有行程
async function fetchEvents() {
    const { data, error } = await _supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('抓取行程失敗:', error);
        return;
    }

    const select = document.getElementById('eventSelect');
    if (data.length > 0) {
        // 生成下拉選單內容
        select.innerHTML = data.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        
        // 如果沒有設定過 currentEventId，預設選第一個
        if (!currentEventId) currentEventId = data[0].id;
        select.value = currentEventId;
    } else {
        select.innerHTML = '<option value="">請先建立行程</option>';
    }

    renderEventGrid(data);
}

function showPage(page) {
    const home = document.getElementById('homePage');
    const detail = document.getElementById('detailPage');

    if (page === 'home') {
        home.style.display = 'block';   // 顯示首頁
        detail.style.display = 'none';  // 隱藏詳情
        fetchEvents(); // 回首頁時刷新列表
    } else {
        home.style.display = 'none';    // 隱藏首頁
        detail.style.display = 'block'; // 顯示詳情
    }
}

// 渲染首頁卡片
async function renderEventGrid(events) {
    const grid = document.getElementById('eventGrid');
    grid.innerHTML = '';

    for (const trip of events) {
        // 撈該行程的消費資料
        const { data } = await _supabase
            .from('expenses')
            .select('amount')
            .eq('event_id', trip.id);

        const count = data ? data.length : 0;
        const total = data ? data.reduce((sum, e) => sum + parseFloat(e.amount), 0) : 0;

        const card = document.createElement('div');
        card.className = 'event-card';

        card.innerHTML = `
            <button class="delete-event-btn" title="刪除行程">×</button>
            <div class="event-card-content">
                <h3>${trip.name}</h3>
                <p class="event-card-meta">${count} 筆消費・總計 $${Math.round(total)}</p>
            </div>
        `;

        card.querySelector('.event-card-content').onclick = () => enterEvent(trip.id);
        card.querySelector('.delete-event-btn').onclick = (e) => {
            e.stopPropagation();
            deleteEvent(trip.id);
        };

        grid.appendChild(card);
    }
}

// 封裝進入行程的動作
function enterEvent(id) {
    currentEventId = id;
    
    // 同步下拉選單
    const select = document.getElementById('eventSelect');
    if (select) select.value = id;

    // 抓取該行程資料
    fetchExpenses(); 

    // 💡 關鍵：切換頁面
    showPage('detail');
    
    // 讓頁面滾動回頂部，避免停留在首頁的捲動位置
    window.scrollTo(0, 0);
}

// 建立行程
function promptNewEvent() {
    modalMembers = [];

    const container = document.getElementById('modalMemberChips');
    container.innerHTML = PRESET_MEMBERS.map(name => `
        <div class="member-chip active" onclick="this.classList.toggle('active')">${name}</div>
    `).join('');

    document.getElementById('newEventName').value = '';
    document.getElementById('modalNewMember').value = '';
    document.getElementById('newEventModal').style.display = 'flex';

    setTimeout(() => document.getElementById('newEventName').focus(), 100);
}

function addModalMember() {
    const input = document.getElementById('modalNewMember');
    const name = input.value.trim();
    if (!name) return;

    const savedMembers = JSON.parse(localStorage.getItem('whoowes_preset_members') || '[]');
    if (savedMembers.includes(name) || modalMembers.includes(name)) {
        alert('這個名字已經存在囉！');
        return;
    }

    modalMembers.push(name);
    input.value = '';

    // 新增一個 chip 到畫面上
    const container = document.getElementById('modalMemberChips');
    const chip = document.createElement('div');
    chip.className = 'member-chip active';
    chip.innerText = name;
    chip.onclick = function() { this.classList.toggle('active'); };
    container.appendChild(chip);
}

function closeNewEventModal() {
    document.getElementById('newEventModal').style.display = 'none';
}

async function confirmNewEvent() {
    const name = document.getElementById('newEventName').value.trim();
    if (!name) return alert('請輸入行程名稱');

    // 收集勾選的成員
    const selectedMembers = Array.from(document.querySelectorAll('#modalMemberChips .member-chip.active'))
        .map(chip => chip.innerText);

    closeNewEventModal();

    const { data, error } = await _supabase
        .from('events')
        .insert([{ name, members: selectedMembers }])
        .select()
        .single();

    if (error) {
        alert('建立失敗：' + error.message);
    } else {
        await fetchEvents();
        enterEvent(data.id);
    }
}

// 刪除行程
async function deleteEvent(id) {
    if (!confirm("確定要刪除此行程嗎？相關帳目也會一起消失喔！")) return;

    // 先刪除該行程下所有帳目
    await _supabase.from('expenses').delete().eq('event_id', id);

    // 再刪除行程本身
    const { error } = await _supabase.from('events').delete().eq('id', id);

    if (error) {
        alert('刪除失敗：' + error.message);
    } else {
        // 如果刪除的是當前行程，重置狀態並回首頁
        if (currentEventId === id) {
            currentEventId = '';
            expenses = [];
            members = [];
            selectedParticipants = [];
        }
        fetchEvents();
    }
}

// 當下拉選單切換時
function changeEvent(eventId) {
    currentEventId = eventId;
    fetchExpenses(); // 重新抓帳目資料
}

// 渲染成員選擇區
function renderMemberSelectors() {
    const container = document.getElementById('memberSelector');
    // 每次渲染前先清空
    container.innerHTML = ''; 

    members.forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'member-chip active'; // 預設加上 active
        chip.innerText = name;
        
        // 點擊事件：切換 active 類名
        chip.onclick = function() {
            this.classList.toggle('active');
        };
        
        container.appendChild(chip);
    });
}

function updatePayerSelect() {
    const payerSelect = document.getElementById('itemPayerSelect');
    if (!payerSelect) return;

    // 備份目前選中的人，避免選單更新後被重置
    const currentSelected = payerSelect.value;

    // 根據全域變數 members 產生選項
    payerSelect.innerHTML = members.map(name => 
        `<option value="${name}">${name}</option>`
    ).join('');

    // 如果剛才選的人還在名單裡，就把它選回去
    if (members.includes(currentSelected)) {
        payerSelect.value = currentSelected;
    }
}

async function fetchExpenses() {
    const select = document.getElementById('eventSelect');
    if (!select || !select.value) return;

    currentEventId = select.value;

    // 同時抓該行程的 members 欄位和消費記錄
    const [{ data: eventData }, { data, error }] = await Promise.all([
        _supabase.from('events').select('members').eq('id', currentEventId).single(),
        _supabase.from('expenses').select('*').eq('event_id', currentEventId).order('date', { ascending: false })
    ]);

    if (error) {
        console.error("抓取失敗:", error);
        return;
    }

    expenses = data;

    // 合併 events.members 和 expenses 裡出現過的人
    const allNames = new Set(eventData?.members || []);

    expenses.forEach(ex => {
        if (ex.payer) allNames.add(ex.payer);
        if (ex.participants) ex.participants.forEach(p => allNames.add(p));
    });

    members = Array.from(allNames);
    selectedParticipants = [...members];

    render();
    renderMemberSelectors();
    updatePayerSelect();
}

async function addExpense() {
    const btn = document.getElementById('submitBtn');
    const payer = document.getElementById('itemPayerSelect').value;
    const desc = document.getElementById('itemDesc').value.trim(); // 這裡叫 desc
    const amount = parseFloat(document.getElementById('itemAmount').value);
    const date = document.getElementById('itemDate').value;
    
    // 💡 必須抓取當前勾選的成員
    // 假設你的勾選清單邏輯是用 class 為 "member-chip" 且有 "active" 狀態來判斷
    const participants = Array.from(document.querySelectorAll('.member-chip.active'))
                             .map(chip => chip.innerText);

    // 基本驗證
    if (!desc || isNaN(amount)) return alert("請填寫項目與金額");
    if (!currentEventId) return alert("請先選擇一個行程");
    if (participants.length === 0) return alert("請至少選擇一位分攤成員");

    btn.disabled = true;
    btn.innerText = "同步中...";

    // 寫入 Supabase 雲端
    const { error } = await _supabase
        .from('expenses')
        .insert([{
            description: desc,      // 💡 修正：把 desc 變數的值存入資料庫的 description 欄位
            amount: amount,
            payer: payer,
            participants: participants,
            date: date,             // 如果資料庫有 date 欄位也要記得傳
            event_id: currentEventId 
        }]);

    if (error) {
        alert("同步失敗：" + error.message);
    } else {
        // 成功後清空輸入框
        document.getElementById('itemDesc').value = '';
        document.getElementById('itemAmount').value = '';
        // 重新讀取資料
        await fetchExpenses(); 
    }

    btn.disabled = false;
    btn.innerText = "新增一筆消費";
}

async function deleteItem(id, desc) {
    if (isDeleting) return;  // 防止重複點擊
    if (!confirm(`確定刪除「${desc}」？`)) return;

    isDeleting = true;

    const { error } = await _supabase.from('expenses').delete().eq('id', id);
    
    if (error) {
        alert('刪除失敗：' + error.message);
    } else {
        await fetchExpenses();
    }

    isDeleting = false;
}

function render() {
    // 更新成員選擇與下拉清單
    const selector = document.getElementById('memberSelector');
    selector.innerHTML = members.map(m => `<div class="member-chip ${selectedParticipants.includes(m) ? 'active' : ''}" onclick="toggleParticipant('${m}')">${m}</div>`).join('');

    const payerSelect = document.getElementById('itemPayerSelect');
    const prev = payerSelect.value;
    payerSelect.innerHTML = members.map(m => `<option value="${m}" ${m === prev ? 'selected' : ''}>${m}</option>`).join('');

    const list = document.getElementById('expenseList');
    const settlementDiv = document.getElementById('settlementReport');
    list.innerHTML = '';
    settlementDiv.innerHTML = '';

    if (expenses.length === 0) {
        document.body.classList.add('has-no-data');
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>目前還沒有任何帳目喔！</p>
                <span>快在上方輸入第一筆支出吧</span>
            </div>
        `;
        return;
    }

    document.body.classList.remove('has-no-data');

    // 計算 balances
    let balances = {};
    members.forEach(m => balances[m] = 0);

    expenses.forEach(item => {
        if (balances[item.payer] !== undefined) balances[item.payer] += parseFloat(item.amount);
        const perPerson = item.amount / item.participants.length;
        item.participants.forEach(p => {
            if (balances[p] !== undefined) balances[p] -= perPerson;
        });
    });

    // 結算建議
    const creditors = [];
    const debtors = [];

    for (let name in balances) {
        const bal = Math.round(balances[name]);
        if (bal > 1) creditors.push({ name, amount: bal });
        if (bal < -1) debtors.push({ name, amount: -bal });
    }

    const transactions = [];
    while (creditors.length && debtors.length) {
        const creditor = creditors[0];
        const debtor = debtors[0];
        const amount = Math.min(creditor.amount, debtor.amount);

        transactions.push({ from: debtor.name, to: creditor.name, amount });

        creditor.amount -= amount;
        debtor.amount -= amount;

        if (creditor.amount === 0) creditors.shift();
        if (debtor.amount === 0) debtors.shift();
    }

    settlementDiv.innerHTML = transactions.length === 0
        ? '<div class="report-item">✅ 大家都結清了！</div>'
        : transactions.map(t => `
            <div class="report-item">
                <span><b>${t.from}</b> → <b>${t.to}</b></span>
                <span class="status-minus">付 $${t.amount}</span>
            </div>
        `).join('');

    // 每人代墊統計
    const paid = {};
    members.forEach(m => paid[m] = 0);

    expenses.forEach(item => {
        if (paid[item.payer] !== undefined) paid[item.payer] += parseFloat(item.amount);
    });

    settlementDiv.innerHTML += `
        <div class="spent-divider">每人代墊總額</div>
        ${members.map(m => `
            <div class="report-item">
                <span>${m}</span>
                <span>$${Math.round(paid[m])}</span>
            </div>
        `).join('')}
    `;

    // 每人實際花費統計
    const spent = {};
    members.forEach(m => spent[m] = 0);

    expenses.forEach(item => {
        const perPerson = parseFloat(item.amount) / item.participants.length;
        item.participants.forEach(p => {
            if (spent[p] !== undefined) spent[p] += perPerson;
        });
    });

    const totalAmount = expenses.reduce((sum, item) => sum + parseFloat(item.amount), 0);

    settlementDiv.innerHTML += `
        <div class="spent-divider">每人應付總額</div>
        ${members.map(m => `
            <div class="report-item">
                <span>${m}</span>
                <span>$${Math.round(spent[m])}</span>
            </div>
        `).join('')}
        <div class="report-item" style="border-top: 1px solid #ddd; margin-top: 8px; padding-top: 8px;">
            <span><b>總計</b></span>
            <span><b>$${Math.round(totalAmount)}</b></span>
        </div>
    `;

    // 按日期分組渲染帳目列表
    const grouped = {};
    expenses.forEach(item => {
        const date = item.date || '未知日期';
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(item);
    });

    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(date => {
        list.innerHTML += `<div class="date-group-header">${date}</div>`;
        grouped[date].forEach(item => {
            list.innerHTML += `<div class="list-item">
                <div class="item-info">
                    <div class="item-desc">${item.description}</div>
                    <div class="item-sub">買單：<b>${item.payer}</b><br/>分攤: ${item.participants.join(', ')}</div>
                </div>
                <div class="item-price">$${Math.round(item.amount)}<span class="delete-btn" onclick="deleteItem(${item.id}, '${item.description}')">×</span></div>
            </div>`;
        });
    });
}

function toggleParticipant(name) {
    selectedParticipants = selectedParticipants.includes(name) ? selectedParticipants.filter(m => m !== name) : [...selectedParticipants, name];
    render();
}
function handleMemberKey(e) {
    if (e.key === 'Enter') {
        const name = e.target.value.trim();
        if (name && !members.includes(name)) {
            members.push(name);
            selectedParticipants.push(name);
            localStorage.setItem('whoowes_members', JSON.stringify(members));
            e.target.value = '';
            render();
        }
    }
}

async function addNewMember() {
    const input = document.getElementById('newMemberName');
    const name = input.value.trim();
    if (!name) return;

    if (members.includes(name)) {
        alert('這個名字已經存在囉！');
        return;
    }

    members.push(name);
    selectedParticipants.push(name);
    input.value = '';

    // 同步寫進 Supabase 的 events 表
    await _supabase
        .from('events')
        .update({ members: members })
        .eq('id', currentEventId);

    render();
}

async function clearData() {
    if (confirm("⚠️ 警告：這會刪除所有行程與帳目，且無法復原！確定要清空嗎？")) {
        await _supabase.from('expenses').delete().gt('id', 0);
        await _supabase.from('events').delete().gt('id', 0);

        currentEventId = '';
        expenses = [];
        members = [];
        selectedParticipants = [];

        alert("雲端資料已清空！頁面將自動重新整理。");
        location.reload();
    }
}

document.getElementById('newMemberName').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        addNewMember();
    }
});