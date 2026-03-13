// --- 請替換以下資訊 ---
const SUPABASE_URL = 'https://naagujwufjeqsgwmyrcv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hYWd1and1ZmplcXNnd215cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjc0MTcsImV4cCI6MjA4ODkwMzQxN30.6MFjNVe2zz1lwGVYx9BSFco7hEZTjvBueGQABrq1apM';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEventId = '';
let expenses = [];
let members = [];
let selectedParticipants = [...members];

window.onload = async function () {
    document.getElementById('itemDate').value = new Date().toISOString().split('T')[0];
    await fetchEvents(); // 先抓行程列表
    await fetchExpenses(); // 初始載入雲端資料

    // 開啟即時監聽：一旦雲端資料變動，立刻更新畫面
    _supabase.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, payload => {
            fetchExpenses();
        }).subscribe();

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
    // 💡 1. 抓取行程 ID
    const select = document.getElementById('eventSelect');
    const eventId = select.value;

    if (!eventId) return; // 沒選行程就不抓

    // 💡 2. 向 Supabase 抓取該行程的帳目
    const { data, error } = await _supabase
        .from('expenses')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("抓取失敗:", error);
    } else {
        // 💡 3. 更新全域變數 expenses
        expenses = data;
        
        // --- 核心改動：重新計算並渲染成員 Chips ---
        
        // A. 先放預設成員 (例如：我, Allen)
        const allNames = new Set([]); 
        
        // B. 再把「雲端帳目裡出現過的人」加進去 (如果有資料)
        expenses.forEach(ex => {
            if (ex.payer) allNames.add(ex.payer);
            if (ex.participants) {
                ex.participants.forEach(p => allNames.add(p));
            }
        });
        
        // C. 更新全域變數 members
        members = Array.from(allNames);
        
        // D. 📢 關鍵：呼叫負責畫 Chips 且加上互動的 function
        // 確保這個 function 內部有寫：chip.className = 'member-chip active';
        if (typeof renderMemberSelectors === "function") {
            renderMemberSelectors(); 
        } else {
            console.error("找不到 renderMemberSelectors 函式！");
        }
        
        // --- 核心改動結束 ---
        
        render(); // 最後畫出帳目清單
    }
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
        fetchData(); 
    }

    btn.disabled = false;
    btn.innerText = "新增一筆消費";
}

async function deleteItem(id, desc) {
    if (!confirm(`確定刪除「${desc}」？`)) return;
    await _supabase.from('expenses').delete().eq('id', id);
}

// (其餘成員管理、計算與 render 邏輯與之前相同，但計算時使用雲端的 expenses 陣列)
// 為節省長度，此處 render 邏輯需對應 table 欄位名 (description, participants)
function render() {
    // 更新成員選擇與下拉清單
    const selector = document.getElementById('memberSelector');
    selector.innerHTML = members.map(m => `<div class="member-chip ${selectedParticipants.includes(m) ? 'active' : ''}" onclick="toggleParticipant('${m}')">${m}</div>`).join('');

    const payerSelect = document.getElementById('itemPayerSelect');
    const prev = payerSelect.value;
    payerSelect.innerHTML = members.map(m => `<option value="${m}" ${m === prev ? 'selected' : ''}>${m}</option>`).join('');

    const list = document.getElementById('expenseList');
    const settlementDiv = document.getElementById('settlementReport');
    list.innerHTML = ''; settlementDiv.innerHTML = '';

    // 檢查是否有資料
    if (expenses.length === 0) {
        document.body.classList.toggle('has-no-data', expenses.length === 0);
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>目前還沒有任何帳目喔！</p>
                <span>快在上方輸入第一筆支出吧</span>
            </div>
        `;
        // 如果沒有資料，結算報告也可以順便清空
        document.getElementById('settlementReport').innerHTML = '';
        return; // 直接結束 render，後面不用跑了
    }

    let balances = {};
    members.forEach(m => balances[m] = 0);

    expenses.forEach(item => {
        if (balances[item.payer] !== undefined) balances[item.payer] += parseFloat(item.amount);
        const perPerson = item.amount / item.participants.length;
        item.participants.forEach(p => {
            if (balances[p] !== undefined) balances[p] -= perPerson;
        });

        list.innerHTML += `<div class="list-item">
                <div class="item-info">
                    <div class="item-desc">${item.description}</div>
                    <div class="item-sub">${item.date} · <b>${item.payer}</b> 付 · 分攤: ${item.participants.join(', ')}</div>
                </div>
                <div class="item-price">$${Math.round(item.amount)}<span class="delete-btn" onclick="deleteItem(${item.id}, '${item.description}')">×</span></div>
            </div>`;
    });

    for (let name in balances) {
        const bal = Math.round(balances[name]);
        if (Math.abs(bal) < 1) continue;
        settlementDiv.innerHTML += `<div class="report-item"><span>${name}</span><span class="${bal > 0 ? 'status-plus' : 'status-minus'}">${bal > 0 ? '應收' : '應付'} $${Math.abs(bal)}</span></div>`;
    }
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

function addNewMember() {
    const input = document.getElementById('newMemberName');
    const name = input.value.trim();
    
    if (name) {
        if (!members.includes(name)) {
            members.push(name);
            input.value = ''; // 清空輸入框
            render();        // 重新渲染畫面
            // 如果你有存 local 或者雲端，記得在這裡呼叫存檔函式
        } else {
            alert('這個名字已經存在囉！');
        }
    }
}

async function clearData() {
    if (confirm("⚠️ 警告：這會刪除「雲端資料庫」中所有的帳目，且無法復原！確定要清空嗎？")) {
        // 刪除 expenses 表格中所有 id 大於 0 的資料 (即所有資料)
        const { error } = await _supabase
            .from('expenses')
            .delete()
            .gt('id', 0);

        if (error) {
            alert("清空失敗：" + error.message);
        } else {
            // 清空本地快取成員，讓它恢復你設定的預設值
            localStorage.removeItem('whoowes_members');
            alert("雲端資料已清空！頁面將自動重新整理。");
            location.reload();
        }
    }
}

document.getElementById('newMemberName').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        addNewMember();
    }
});