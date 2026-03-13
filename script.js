// --- 請替換以下資訊 ---
const SUPABASE_URL = 'https://naagujwufjeqsgwmyrcv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hYWd1and1ZmplcXNnd215cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjc0MTcsImV4cCI6MjA4ODkwMzQxN30.6MFjNVe2zz1lwGVYx9BSFco7hEZTjvBueGQABrq1apM';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let expenses = [];
let members = JSON.parse(localStorage.getItem('whoowes_members')) || ['ㄉ', 'ㄐㄅ'];
let selectedParticipants = [...members];

window.onload = async function () {
    document.getElementById('itemDate').value = new Date().toISOString().split('T')[0];
    await fetchExpenses(); // 初始載入雲端資料

    // 開啟即時監聽：一旦雲端資料變動，立刻更新畫面
    _supabase.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, payload => {
            fetchExpenses();
        }).subscribe();

    render();
};

async function fetchExpenses() {
    const { data, error } = await _supabase.from('expenses').select('*').order('date', { ascending: false });
    if (!error) {
        expenses = data;
        render();
    }
}

async function addExpense() {
    const btn = document.getElementById('submitBtn');
    const payer = document.getElementById('itemPayerSelect').value;
    const desc = document.getElementById('itemDesc').value.trim();
    const amount = parseFloat(document.getElementById('itemAmount').value);
    const date = document.getElementById('itemDate').value;

    if (!desc || isNaN(amount)) return alert("填寫不完整");

    btn.disabled = true;
    btn.innerText = "同步中...";

    // 寫入 Supabase 雲端
    const { error } = await _supabase.from('expenses').insert([{
        date, payer, description: desc, amount, participants: selectedParticipants
    }]);

    if (error) alert("同步失敗：" + error.message);

    btn.disabled = false;
    btn.innerText = "同步記一筆";
    document.getElementById('itemDesc').value = '';
    document.getElementById('itemAmount').value = '';
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