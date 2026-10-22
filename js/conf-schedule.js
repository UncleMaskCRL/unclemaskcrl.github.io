/**
 * 会议报告页:每行报告加勾选按钮 + 页首「我的日程」面板
 * - 勾选状态存 localStorage(仅本机浏览器)
 * - 面板按 日期 + 开始时间 排序,自动检测时间冲突
 * - 兼容 pjax 导航:DOM 替换后脚本会被 pjax 重新执行;init 做了幂等保护
 */
(function () {
  var STORAGE_KEY = 'conf-schedule-20261023-osec';

  function startMin(t) {
    var m = /(\d{1,2}):(\d{2})/.exec(t);
    return m ? (+m[1]) * 60 + (+m[2]) : 9999;
  }
  function endMin(t) {
    var m = /-(\d{1,2}):(\d{2})/.exec(t);
    return m ? (+m[1]) * 60 + (+m[2]) : 0;
  }
  function normVenue(v) {
    if (!v) return '场馆待定';
    v = v.trim();
    if (/二楼\d+$/.test(v)) v += '会议室';
    return v;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function save(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

  function render() {
    var box = document.getElementById('schedule-list');
    if (!box) return;
    var s = load();
    var list = Object.keys(s).map(function (k) { return s[k]; });
    list.sort(function (a, b) {
      if (a.dateNum !== b.dateNum) return a.dateNum - b.dateNum;
      return a.tStart - b.tStart;
    });
    var cnt = document.getElementById('sched-count');
    if (cnt) cnt.textContent = list.length ? '(已选 ' + list.length + ' 场)' : '';
    if (!list.length) {
      box.innerHTML = '<em style="color:#999">还没有选择报告 — 去下面各分会表格最左侧勾选吧</em>';
      return;
    }
    var html = '';
    list.forEach(function (it, idx) {
      var conflict = false;
      for (var k = 0; k < list.length; k++) {
        if (k === idx) continue;
        var o = list[k];
        if (o.dateNum === it.dateNum && it.tStart < o.tEnd && o.tStart < it.tEnd) {
          conflict = true; break;
        }
      }
      html += '<div class="sched-item' + (conflict ? ' conflict' : '') + '">' +
        '<div class="sched-when">' + (conflict ? '⚠️ 与其它所选报告时间冲突　' : '') +
        esc(it.date) + ' ' + esc(it.time) + '</div>' +
        '<div class="sched-where">📍 ' + esc(it.venue) +
        (it.hall ? '　·　' + esc(it.hall) : '') + '</div>' +
        '<div class="sched-who"><b>' + esc(it.speaker) + '</b>' +
        (it.org && it.org !== '—' ? ' · ' + esc(it.org) : '') + '</div>' +
        '<div class="sched-title">' + (it.title && it.title !== '—' ? esc(it.title) : '') + '</div>' +
        '<button class="sched-remove" data-id="' + esc(it.id) + '" title="取消选择">×</button>' +
        '</div>';
    });
    box.innerHTML = html;
  }

  function init() {
    var marker = document.getElementById('conf-app');
    if (!marker) return;
    var article = document.querySelector('.article');
    if (!article) return;
    // 同一 DOM 重复调用(pjax:complete 与脚本重执行双触发)→ 只刷新面板,不重插勾选框
    if (article.getAttribute('data-conf-init') === '1') { render(); return; }
    article.setAttribute('data-conf-init', '1');

    // ---- 1. 页首建「我的日程」面板(若已存在则不重复建) ----
    if (!document.getElementById('my-schedule-panel')) {
      var panel = document.createElement('div');
      panel.id = 'my-schedule-panel';
      panel.innerHTML =
        '<details open>' +
        '<summary>📋 我的参会日程 <span id="sched-count"></span></summary>' +
        '<div class="sched-hint">勾选下方各报告行最左侧的按钮,这里会按「日期 + 时间」排好你要听哪场、在哪个场馆、听谁的什么报告。' +
        '数据只存在你本机浏览器(localStorage)里,换电脑或清缓存会丢失。</div>' +
        '<div id="schedule-list"></div>' +
        '<button id="clear-schedule" type="button">清空全部选择</button>' +
        '</details>';
      article.insertBefore(panel, article.firstChild);
    }

    // ---- 2. 遍历 DOM,从 h2/h3 继承日期/时段/场馆/分会,收集各表报告 ----
    var curDate = '', curDateNum = 0, curVenue = '', curPeriod = '', curHall = '';
    var reports = [];
    var els = article.children;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tag = el.tagName.toLowerCase();
      if (tag === 'h2' || tag === 'h3') {
        var tx = el.textContent;
        // 提取分会名: 分会A~I / 研究生创新论坛 / 开闭幕式 / AMF
        var hm = /分会([A-Z]|D-1|D-2)/.exec(tx);
        if (hm) curHall = '分会' + hm[1];
        else if (/研究生创新论坛/.test(tx)) curHall = '研究生论坛';
        else if (/Advanced Materials Forum/.test(tx)) curHall = 'AMF';
        else if (/开幕式/.test(tx)) curHall = '开幕式大会报告';
        else if (/闭幕式/.test(tx)) curHall = '闭幕式大会报告';
        var dm = /(\d{1,2})月(\d{1,2})日/.exec(tx);
        if (dm) { curDate = dm[1] + '月' + dm[2] + '日'; curDateNum = +dm[2]; }
        if (/上午/.test(tx)) curPeriod = 'am';
        else if (/下午/.test(tx)) curPeriod = 'pm';
        var vm = /二楼\s*(\d+)/.exec(tx);
        if (vm) curVenue = '二楼' + vm[1];
        var nx = el.nextElementSibling;
        if (nx && nx.tagName.toLowerCase() === 'p') {
          var nt = nx.textContent;
          var pm = /地点[:：]\s*([^|]+)/.exec(nt);
          if (pm) curVenue = pm[1].trim();
          if (!dm) {
            var dm2 = /(\d{1,2})月(\d{1,2})日/.exec(nt);
            if (dm2) { curDate = dm2[1] + '月' + dm2[2] + '日'; curDateNum = +dm2[2]; }
          }
        }
      } else if (tag === 'table') {
        // 先清掉任何上次残留的勾选列,保证幂等
        el.querySelectorAll('td.conf-cb-cell, th.conf-cb-head').forEach(function (c) {
          c.parentNode.removeChild(c);
        });
        // 表头加「选」列
        var hr0 = el.querySelector('tr');
        if (hr0 && hr0.querySelector('th')) {
          var th0 = document.createElement('th');
          th0.className = 'conf-cb-head';
          th0.textContent = '选';
          hr0.insertBefore(th0, hr0.querySelector('th')); // 插到第一个 th 前
        }
        // 逐行:当场收集 + 当场加勾选框
        var trs = el.querySelectorAll('tr');
        for (var j = 0; j < trs.length; j++) {
          var tr = trs[j];
          var tds = tr.querySelectorAll('td');
          if (tds.length < 4) continue; // 表头行(th)或异常行
          // 新列序: 报告人 | 报告题目 | 时间 | 单位
          var speaker = tds[0].textContent.trim();
          var title = tds[1].textContent.trim();
          var time = tds[2].textContent.trim();
          var org = tds[3].textContent.trim();
          if (!/\d{1,2}:\d{2}/.test(time)) continue;
          // 环节行(茶歇/颁奖/致辞等): 报告人为空(或占位—),题目列放环节名
          //   -> 不加勾选框,但补一个空「选」格占位,保证每行列数对齐不左移
          if (speaker === '' || speaker === '—') {
            var tdEmpty = document.createElement('td');
            tdEmpty.className = 'conf-cb-cell';
            tr.insertBefore(tdEmpty, tds[0]);
            continue;
          }
          // 加勾选框到该行:插到「时间列(tds[0])」这个真实 DOM 节点前面
          var tdCb = document.createElement('td');
          tdCb.className = 'conf-cb-cell';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'conf-cb';
          tdCb.appendChild(cb);
          tr.insertBefore(tdCb, tds[0]); // 关键:插在第一列(报告人)td前面,绝不挤错列
          // AMF 分会用 12 小时制(下午 2:00-5:35),统一归一为 24 小时分钟数
          var tS = startMin(time), tE = endMin(time);
          if (curPeriod === 'pm' && tS < 12 * 60) { tS += 12 * 60; tE += 12 * 60; }
          var id = curDateNum + '|' + time + '|' + speaker;
          cb.dataset.id = id;
          reports.push({
            id: id, date: curDate, dateNum: curDateNum, time: time,
            venue: normVenue(curVenue), hall: curHall,
            speaker: speaker, org: org, title: title,
            tStart: tS, tEnd: tE, cb: cb
          });
        }
      }
    }

    // ---- 4. 恢复勾选态 + 绑定事件 ----
    var saved = load();
    reports.forEach(function (r) {
      var cb = r.cb;
      if (saved[r.id]) cb.checked = true;
      cb.addEventListener('change', function () {
        var s = load();
        if (cb.checked) {
          s[r.id] = {
            id: r.id, date: r.date, dateNum: r.dateNum, time: r.time,
            venue: r.venue, hall: r.hall,
            speaker: r.speaker, org: r.org, title: r.title,
            tStart: r.tStart, tEnd: r.tEnd
          };
        } else { delete s[r.id]; }
        save(s); render();
      });
    });

    // 面板内:删除单条(事件委托)
    document.getElementById('schedule-list').addEventListener('click', function (e) {
      var btn = e.target.closest('.sched-remove');
      if (!btn) return;
      var s = load();
      delete s[btn.dataset.id];
      save(s);
      var cb = article.querySelector('input.conf-cb[data-id="' + btn.dataset.id + '"]');
      if (cb) cb.checked = false;
      render();
    });
    // 清空全部
    document.getElementById('clear-schedule').addEventListener('click', function () {
      if (!confirm('确定清空所有已选报告吗?')) return;
      localStorage.removeItem(STORAGE_KEY);
      article.querySelectorAll('input.conf-cb').forEach(function (cb) { cb.checked = false; });
      render();
    });

    render();
  }

  function bindPjax() {
    if (window.__confSchedPjaxBound) return;
    window.__confSchedPjaxBound = true;
    document.addEventListener('pjax:complete', function () { setTimeout(init, 0); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); bindPjax(); });
  } else {
    init(); bindPjax();
  }
})();
