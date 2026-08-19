// 创建右键菜单项
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "exportAsJson",
    title: "导出页面数据为JSON",
    contexts: ["page"]
  });
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "exportAsJson") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeAndDownloadAsJson
    });
  }
});

// 此函数将在目标网页的上下文中执行
function scrapeAndDownloadAsJson() {
  /**
   * 将字符串清理为安全的文件名。
   * 移除非法文件系统字符并折叠空格。
   * @param {string} name - 输入的文件名字符串。
   * @returns {string} 对文件系统安全的清理后的文件名。
   */
  function sanitizeFilename(name) {
    if (!name) return '';
    return String(name)
      .replace(/\\/g, '-')
      .replace(/\//g, '-')
      .replace(/[:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s/g, '_');
  }

  /**
   * 将 Date 对象格式化为文件系统安全的时间戳字符串。
   * 生成 ISO 格式，冒号和点号被替换：YYYY-MM-DDTHH-mm-ss。
   * @param {Date|string|number} d - Date 对象或有效的 Date 构造函数参数。
   * @returns {string} 对文件名安全的格式化时间戳字符串。
   */
  function formatTimestamp(d) {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
  }
  /**
   * 在页面上显示短暂的通知浮窗。
   * 3 秒后自动消失。
   * @param {string} title - 粗体通知标题。
   * @param {string} message - 通知正文文本。
   * @param {string} [type='info'] - 通知类型：'info'、'success' 或 'error'。
   */
  function showNotification(title, message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fbdll-notification ${type}`;
    const inner = document.createElement('div');
    inner.innerHTML = `<strong>${title}</strong><div style="margin-top:6px">${message}</div>`;
    notification.appendChild(inner);
    document.body.appendChild(notification);
    setTimeout(() => { notification.style.opacity = '0'; setTimeout(() => notification.remove(), 300); }, 3000);
  }

  // 注入共享 CSS 用于模态框、按钮、通知（仅一次）
  if (!document.querySelector('#fbdll-injected-style')) {
    const style = document.createElement('style');
    style.id = 'fbdll-injected-style';
    style.textContent = `
      @keyframes slideIn { from { transform: translateX(200px); opacity:0 } to { transform: translateX(0); opacity:1 } }
      .fbdll-modal { position:fixed;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:10001;background:rgba(0,0,0,0.3); }
      .fbdll-box { background:#fff;padding:16px;border-radius:12px;width:min(460px,calc(100% - 32px));box-shadow:0 8px 20px rgba(0,0,0,0.18);font-family:Arial,sans-serif;color:#222 }
      .fbdll-export-title { font-weight:700;font-size:16px;margin-bottom:14px }
      .export-options { display:flex;gap:10px;margin-bottom:12px }
      .format-option { flex:1;padding:12px;border-radius:10px;border:1px solid #e6eef8;background:#fff;color:#333;text-align:left;cursor:pointer;box-shadow:none }
      .format-option .label-strong{ display:block }
      .format-option .label-small{ color:#556;padding-top:4px;display:block }
      .format-option.active{ box-shadow:0 2px 8px rgba(11,95,165,0.08); border:1px solid rgba(11,95,165,0.12) }
      .format-option.active[data-format="json"]{ background:#f3f9ff;color:#0b5fa5 }
      .format-option.active[data-format="txt"]{ background:#fff7e6;color:#a05f00 }
      .fbdll-actions{ display:flex;justify-content:flex-end;gap:8px }
      .fbdll-question-selector { margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .fbdll-selection-info { color: #555; font-size: 13px; }
      .fbdll-select-toggle { white-space: nowrap; }
      .fbdll-question-list { max-height: 330px; overflow-y: auto; border: 1px solid #e6eef8; border-radius: 12px; background: #f7fbff; }
      .fbdll-question-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #eef4fb; background: #fff; cursor: pointer; }
      .fbdll-question-item:last-child { border-bottom: none; }
      .fbdll-question-item input { margin-top: 3px; width: 18px; height: 18px; accent-color: #0078d4; }
      .fbdll-question-summary { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 13px; color: #222; line-height: 1.4; }
      .fbdll-question-summary .summary-label { font-weight: 600; color: #0b5fa5; }
      .fbdll-question-summary .summary-text { color: #4a4a4a; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .fbdll-btn{ padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer }
      .fbdll-btn-primary{ background:#0078d4;color:#fff;border:none }
      .fbdll-btn-secondary{ background:#fff;color:#333 }
      .fbdll-notification{ position: fixed; top: 20px; right: 20px; padding: 12px 16px; border-radius: 8px; font-family: Arial, sans-serif; font-size: 13px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.12); animation: slideIn .28s ease; opacity:1; transition: opacity .3s ease }
      .fbdll-notification.info{ background:#d1ecf1;color:#0c5460;border:1px solid #bee5eb }
      .fbdll-notification.success{ background:#d4edda;color:#155724;border:1px solid #c3e6cb }
      .fbdll-notification.error{ background:#f8d7da;color:#721c24;border:1px solid #f5c6cb }
    `;
    document.head.appendChild(style);
  }

  /**
   * 检测当前页面的版本类型，用于诊断和兼容性跟踪。
   * @param {Element} container - .ti-container 元素。
   * @returns {string} 页面版本标识符。
   */
  function detectPageVersion(container) {
    if (container.querySelector('article.content')) return 'v1_专项智能练习';
    if (container.querySelector('app-format-html')) return 'v2_粉笔题库单页面';
    return 'v_unknown_未知版本';
  }

  /**
   * 序列化 DOM 节点的内容，提取纯文本、HTML、图片和嵌套列表的结构化表示。
   * @param {Element} node
   * @param {string} role - 'stem' | 'option' | 'solution' (用于标注图片角色)
   * @returns {{text:string, html:string, images:Array, lists:Array}}
   */
  function serializeNodeContent(node, role = 'stem') {
    if (!node) return { text: '', html: '', images: [], lists: [] };

    // 获取安全的 innerHTML（去掉脚本等）
    const clone = node.cloneNode(true);
    // remove script/style
    clone.querySelectorAll('script,style').forEach(n => n.remove());
    const html = clone.innerHTML.trim();

    // 构造文本并在图片处插入通用占位符 [IMG]
    const images = [];
    function nodeToText(n) {
      if (n.nodeType === Node.TEXT_NODE) return n.textContent.replace(/\s+/g, ' ');
      if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = n.tagName.toLowerCase();
        if (tag === 'img') {
          // collect image info and insert marker
          const srcRaw = n.getAttribute('src') || n.getAttribute('data-src') || '';
          let src = srcRaw;
          try { src = new URL(srcRaw, document.baseURI).href; } catch (e) { /* ignore */ }
          images.push({ role, src, alt: n.getAttribute('alt') || '', isTex: String(n.getAttribute('flag') || '').toLowerCase() === 'tex' });
          return '[IMG]';
        }
        if (tag === 'br') return '\n';
        // for paragraph-like containers, join child nodes and preserve paragraph breaks
        if (tag === 'p' || tag === 'div') {
          const parts = Array.from(n.childNodes).map(nodeToText).filter(Boolean).join('');
          return parts + '\n';
        }
        // for list items, keep text content
        if (tag === 'li') {
          const parts = Array.from(n.childNodes).map(nodeToText).filter(Boolean).join('');
          return parts + '\n';
        }
        // for other elements, recurse
        return Array.from(n.childNodes).map(nodeToText).join('');
      }
      return '';
    }

    const text = Array.from(clone.childNodes).map(nodeToText).join('').trim();

    // 提取嵌套列表为递归结构
    function serializeList(listEl) {
      const out = [];
      Array.from(listEl.children).forEach(li => {
        if (li.tagName.toLowerCase() !== 'li') return;
        const nested = li.querySelector('ul,ol');
        const c = li.cloneNode(true);
        c.querySelectorAll('ul,ol').forEach(n => n.remove());
        const itemText = c.textContent.trim();
        out.push(nested ? { text: itemText, sub: serializeList(nested) } : itemText);
      });
      return out;
    }

    const lists = [];
    Array.from(clone.querySelectorAll('ul,ol')).forEach(l => {
      // only add top-level lists (ignore lists that are nested inside li when their parent list already captured)
      if (l.closest('li') && l.closest('li').closest('ul,ol')) return;
      lists.push(serializeList(l));
    });

    return { text, html, images, lists };
  }

  /**
   * 从页面 DOM 中提取结构化题目数据。
   * 解析 .ti-container 元素并返回包含元数据和题目数组的 JSON 对象。
   * @returns {Object} { jsonData: {pageTitle, pageUrl, extractTime, totalQuestions, questions, metadata}, parseErrors: number }
   * @throws {Error} 如果页面上找不到任何题目容器。
   */
  function extractQuestions() {
    const url = window.location.href;
    const pageTitle = document.title || '无标题';
    const containers = document.querySelectorAll('.ti-container');
    const questions = [];
    let parseErrors = 0;

    containers.forEach((container, idx) => {
      try {
        const question = {};
        const titleIndex = container.querySelector('.title-index');
        question.questionNumber = titleIndex ? titleIndex.textContent.trim() : `${idx + 1}.`;
        const titleType = container.querySelector('.title-type-name');
        question.questionType = titleType ? titleType.textContent.trim() : '未知';

        // Map question to section/chapter when possible
        let sectionName = '未知';
        let sectionIndex = -1;
        const titleEl = container.querySelector('.title');
        if (titleEl && titleEl.id) {
          const m = titleEl.id.match(/^title-(\d+)-(?:\d+)-(?:\d+)/);
          if (m) sectionIndex = parseInt(m[1], 10);
        }

        // Helper to extract chapter name text node (first text node inside .chapter-name)
        function extractChapterName(chEl) {
          if (!chEl) return '';
          for (const n of chEl.childNodes) {
            if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) return n.textContent.trim();
          }
          return chEl.textContent.trim();
        }

        // Robust chapter-finding: prefer anchor-based, then closest previous chapter container in document order
        function findChapterByAnchor(idx) {
          if (idx === undefined || idx === null) return null;
          // try exact match first, then prefix match
          const exact = document.querySelector(`a[name="anchor-ti-${idx}-0"]`);
          if (exact) {
            let prev = exact.previousElementSibling;
            while (prev) {
              if (prev.classList && prev.classList.contains('chapter-container')) return prev;
              prev = prev.previousElementSibling;
            }
          }
          const prefix = document.querySelectorAll(`a[name^="anchor-ti-${idx}-"]`);
          if (prefix && prefix.length) {
            for (const a of prefix) {
              let prev = a.previousElementSibling;
              while (prev) {
                if (prev.classList && prev.classList.contains('chapter-container')) return prev;
                prev = prev.previousElementSibling;
              }
            }
          }
          return null;
        }

        function findNearestPrevChapter(el) {
          const chapters = Array.from(document.querySelectorAll('.chapter-container'));
          // pick last chapter that appears before el in document order
          let chosen = null;
          for (const ch of chapters) {
            if (ch === el) break;
            const rel = ch.compareDocumentPosition(el);
            if (rel & Node.DOCUMENT_POSITION_FOLLOWING) chosen = ch;
          }
          return chosen;
        }

        if (sectionIndex !== -1) {
          const ch = findChapterByAnchor(sectionIndex) || findNearestPrevChapter(container);
          if (ch) {
            const nameEl = ch.querySelector('.chapter-name');
            if (nameEl) sectionName = extractChapterName(nameEl);
          }
        } else {
          const tiBlock = container.closest('.ti') || container.closest('.tis-container') || container.closest('.ti-container');
          const ch = tiBlock ? (findNearestPrevChapter(tiBlock) || null) : null;
          if (ch) {
            const nameEl = ch.querySelector('.chapter-name');
            if (nameEl) sectionName = extractChapterName(nameEl);
          }
        }

        question.section = sectionName;
        question.sectionIndex = sectionIndex;

        // 题干提取：使用优先级回退链兼容新旧页面结构
        // 优先级 1: 旧页面结构 (article.content)
        // 优先级 2: 新页面结构 (app-format-html)
        // 优先级 3: 其他可能的容器
        const stemSelectors = [
          'article.content',                    // 旧页面："专项智能练习"
          'app-format-html',                    // 新页面："粉笔题库-单页面"
          '.question-choice-container',         // 直接选择问题容器
        ];

        let contentNode = null;
        for (const selector of stemSelectors) {
          const found = container.querySelector(selector);
          if (found && found.textContent.trim().length > 0) {
            contentNode = found;
            break;
          }
        }

        // 使用序列化器提取题干（包含图片和嵌套列表）
        const stemSerialized = contentNode ? serializeNodeContent(contentNode, 'stem') : { text: '', html: '', images: [], lists: [] };
        question.contentHtml = stemSerialized.html;
        // 初始化题目级图片集合与文本占位处理：将本段 [IMG] 占位符替换为全局编号 [IMG1]、[IMG2] ...
        question.images = [];
        let stemText = stemSerialized.text || '';
        (stemSerialized.images || []).forEach(img => {
          const idx = question.images.length + 1;
          question.images.push(Object.assign({}, img, { index: idx }));
          stemText = stemText.replace('[IMG]', `[IMG${idx}]`);
        });
        question.contentText = stemText.trim();
        
        // todo: 更智能的提问句识别和占位处理，目前先采用简单的基于最后一个句号的分界方法，后续可考虑引入 NLP 技术进行更准确的提问句识别和内容处理
        // 希望后面能实现对提问句的智能识别：不仅仅只适用于逻辑填空题，其他的主旨理解甚至是非选择题也能正确识别提问句并保留其格式不变，同时对其他部分进行适当的空格占位处理，以适应不同题型的需求
        // function processQuestionAndContent(htmlStr){
        //   const pRegex = /<p[^>]*>(.*?)<\/p>/g;
        //   const sentences = [];
        //   let match;
        //   while ((match = pRegex.exec(htmlStr)) !== null) {
        //     const text = match[1].trim();
        //     sentences.push(text);
        //   }

        //   if (sentences.length === 0) return htmlStr; // 如果没有<p>标签，返回原始字符串

        //   let question = null;
        //   let questionIndex = -1;

        //   const checkSentence = (s) => {
        //     return /依次填入/.test(s) && /横线｜划线｜括号/.test(s) && /最恰当/.test(s);
        //   };

        //   // 检查第一句是不是提问，若不是，则检查最后一句
        //   if (checkSentence(sentences[0])) {
        //     question = sentences[0];
        //     questionIndex = 0;
        //   } else if (checkSentence(sentences[sentences.length - 1])) {
        //     question = sentences[sentences.length - 1];
        //     questionIndex = sentences.length - 1;
        //   }

        //   const processedSentences = sentences.map((s, idx) => {
        //     if (idx === questionIndex) return s; // 提问句保持不变
        //     // 如果提问句中存在“括号”两字，也不处理，否则将其他句子中的空格或连续空格替换为______，并将原本已经存在的下划线统一替换为______，以保持格式一致
        //     if (question && /括号/.test(question)) return s;
        //     return s.replace(/[ 　]+/g, '______');
        //   });

        //   return processedSentences.map(s => `<p>${s}</p>`).join('');
        // }
        // 找到contentText中的倒数第一个“。”
        const lastPeriodIdx = question.contentText.lastIndexOf('。');
        // 如果倒数第一个“。”位置在末位，则找倒数第二个“。”，以此类推，直到找到一个“。”或没有为止，确定提问部分的分界点
        let questionStemIdx = lastPeriodIdx;
        // 控制台输出调试信息：原始题干文本和初始分界点位置
        console.debug(`原始题干文本: "${question.contentText}"`);
        console.debug(`初始分界点位置: ${questionStemIdx}`);
        while (questionStemIdx === question.contentText.length - 1 && questionStemIdx !== -1) {
          questionStemIdx = question.contentText.lastIndexOf('。', questionStemIdx - 1);
        }
        const before = question.contentText.substring(0, questionStemIdx);
        const after = question.contentText.substring(questionStemIdx);
        console.debug(`Before: "${before}"`);
        console.debug(`After: "${after}"`);
        // 如果 after 中不包含“括号”二字，则将 contentText 设置为 before 中的所有空格（1个空格或多个连续空格）都替换为______后再加上 after
        // 若原本已经存在的下划线，则统一替换为______，以保持格式一致
        if (!after.includes('括号')) {
          question.contentText = before.replace(/[ 　]+/g, '______') + after;
        }
        
        // 兼容旧字段，保留 questionStem 用于 TXT 导出
        question.questionStem = question.contentText;
        question.nestedLists = (stemSerialized.lists && stemSerialized.lists.length) ? stemSerialized.lists : [];

        const options = {};
        container.querySelectorAll('.choice-radio-label').forEach(label => {
          const keyEl = label.querySelector('.input-radio');
          // 使用序列化器处理选项内容，支持图片/嵌套列表
          const s = serializeNodeContent(label, 'option');
          const key = keyEl ? keyEl.textContent.trim() : `opt-${Object.keys(options).length + 1}`;

          // 替换选项文本中的 [IMG] 占位符为全局编号，并把图片合并到题目层
          let optText = s.text || '';
          const optImages = [];
          (s.images || []).forEach(im => {
            const idx = question.images.length + 1;
            const imObj = Object.assign({}, im, { role: `option-${key}`, index: idx });
            question.images.push(imObj);
            optImages.push(imObj);
            optText = optText.replace('[IMG]', `[IMG${idx}]`);
          });
          // 若选项文本中存在 A \n、B \n、C \n、D \n 等前缀，则去掉
          optText = optText.replace(/^[A-D]\s*\n/gm, '');
          // 若选项文本中存在空格或连续空格，则将其替换为两个空格
          optText = optText.replace(/\s+/g, '  ');
          options[key] = {
            text: optText,
            html: s.html,
            images: optImages,
            lists: s.lists,
          };

          if (s.lists && s.lists.length) question.nestedLists = question.nestedLists.concat(s.lists);
        });
        question.options = options;

        const correctAnswerEl = container.querySelector('.overall-item-value.correct-answer');
        question.correctAnswer = correctAnswerEl ? correctAnswerEl.textContent.trim() : '未知';
        const correctRateEl = container.querySelector('.overall-item-value.correct-rate');
        question.correctRate = correctRateEl ? correctRateEl.textContent.trim() : '未知';
        const errorProneEl = container.querySelector('.overall-item-value.error-prone');
        question.errorProne = errorProneEl ? errorProneEl.textContent.trim() : '无';

        question.solution = {};
        const resultCommon = container.querySelector('.result-common-container');
        if (resultCommon) {
          resultCommon.querySelectorAll('.result-common-section').forEach(section => {
            const titleEl = section.querySelector('.solution-title');
            const contentEl = section.querySelector('.content');
            if (titleEl && contentEl) {
              const t = titleEl.textContent.trim();
              const s = serializeNodeContent(contentEl, 'solution');
              if (t === '解析') {
                // 将解析文本中的 [IMG] 占位符替换为全局编号，并合并图片
                let analysisText = s.text || '';
                const solImages = [];
                (s.images || []).forEach(im => {
                  const idx = question.images.length + 1;
                  const imObj = Object.assign({}, im, { role: 'solution', index: idx });
                  question.images.push(imObj);
                  solImages.push(imObj);
                  analysisText = analysisText.replace('[IMG]', `[IMG${idx}]`);
                });
                question.solution.analysis = analysisText;
                if (s.lists && s.lists.length) question.nestedLists = question.nestedLists.concat(s.lists);
              }
              else if (t === '考点') question.solution.keypoint = s.text;
              else if (t === '来源') question.solution.source = s.text;
            }
          });
          if (!question.solution.keypoint) {
            const keypointContainer = resultCommon.querySelector('.solution-keypoint-container');
            if (keypointContainer) {
              const kp = [];
              keypointContainer.querySelectorAll('.solution-keypoint-item-name').forEach(it => { const t = it.textContent.trim(); if (t) kp.push(t); });
              if (kp.length) question.solution.keypoint = kp.join('、');
            }
          }
        }

        // 🆕 收集诊断数据（仅用于 JSON 导出）
        const stemLength = question.contentText ? question.contentText.length : 0;
        const optionsCount = Object.keys(options).length;
        question.diagnostics = {
          pageVersion: detectPageVersion(container),
          extraction: {
            stem: {
              found: !!contentNode,
              length: stemLength,
              paragraphs: question.contentText ? question.contentText.split('\n').length : 0,
              hasNestedLists: (question.nestedLists && question.nestedLists.length > 0),
            },
            options: {
              found: optionsCount,
              expected: 4,
              complete: optionsCount >= 4,
            },
            answer: {
              correct: correctAnswerEl !== null,
              rate: correctRateEl !== null,
            },
            solution: {
              analysis: !!question.solution.analysis,
              keypoint: !!question.solution.keypoint,
              hasNestedLists: (question.nestedLists && question.nestedLists.length > 0),
            },
          },
          health: {
            isComplete: optionsCount >= 4 && stemLength > 0 && correctAnswerEl !== null,
            hasCriticalMissing: !contentNode || optionsCount < 2,
            confidence: (stemLength > 20 && optionsCount >= 4) ? 'high' : 'low',
          },
        };
        // 补充章节信息到诊断
        question.diagnostics.section = { name: question.section, index: question.sectionIndex };
        // 补充图片计数诊断
        question.diagnostics.extraction.imagesCount = question.images ? question.images.length : 0;
        question.diagnostics.extraction.imageTypesSummary = (function () {
          const s = { tex: 0, normal: 0 };
          (question.images || []).forEach(i => { if (i.isTex) s.tex++; else s.normal++; });
          return s;
        })();

        questions.push(question);
      } catch (e) {
        console.error('解析容器出错', e);
        parseErrors++;
      }
    });

    if (questions.length === 0) throw new Error('未找到任何题目容器（.ti-container），请确保页面已完全加载');

    const jsonData = {
      pageTitle,
      pageUrl: url,
      extractTime: new Date().toISOString(),
      totalQuestions: questions.length,
      questions
    };

    // 附加元数据，包括 parseErrors、scrapeVersion 和诊断汇总
    const completeCount = questions.filter(q => q.diagnostics.health.isComplete).length;
    const incompleteCount = questions.filter(q => !q.diagnostics.health.isComplete).length;
    const problematicQuestions = questions
      .map((q, i) => ({ index: i + 1, health: q.diagnostics.health }))
      .filter(q => q.health.hasCriticalMissing);

    const imagesQuestionsCount = questions.filter(q => q.diagnostics.extraction.imagesCount > 0).length;
    const nestedListsCount = questions.filter(q => (q.nestedLists && q.nestedLists.length > 0)).length;

    // per-section aggregation
    const sectionsMap = {};
    questions.forEach(q => {
      const key = `${(q.sectionIndex !== undefined && q.sectionIndex !== null) ? q.sectionIndex : -1}:${q.section || '未知'}`;
      if (!sectionsMap[key]) sectionsMap[key] = { name: q.section || '未知', index: (q.sectionIndex !== undefined && q.sectionIndex !== null) ? q.sectionIndex : -1, questionCount: 0, imagesCount: 0, nestedListsCount: 0, completeCount: 0 };
      sectionsMap[key].questionCount += 1;
      sectionsMap[key].imagesCount += (q.images && q.images.length) ? q.images.length : 0;
      sectionsMap[key].nestedListsCount += (q.nestedLists && q.nestedLists.length) ? q.nestedLists.length : 0;
      if (q.diagnostics && q.diagnostics.health && q.diagnostics.health.isComplete) sectionsMap[key].completeCount += 1;
    });
    const sectionsSummary = Object.values(sectionsMap).sort((a, b) => a.index - b.index);

    jsonData.metadata = {
      parseErrors,
      scrapeVersion: '1.0.0',
      diagnosticsSummary: {
        completeCount,
        incompleteCount,
        completionRate: `${(completeCount / questions.length * 100).toFixed(2)}%`,
        imagesQuestionsCount,
        nestedListsCount,
        sections: sectionsSummary,
        problematicQuestions: problematicQuestions.length > 0 ? problematicQuestions : [],
      },
    };

    return { jsonData, parseErrors };
  }

  /**
   * 触发浏览器下载内容为文件。
   * 使用 Blob 和对象 URL 来启动下载对话框。
   * @param {string} content - 要下载的文件内容。
   * @param {string} filename - 下载文件的名称。
   * @param {string} mime - Blob 的 MIME 类型（例如 'application/json;charset=utf-8'）。
   */
  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  /**
   * 将结构化题目数据从 JSON 转换为人类可读的 TXT 格式。
   * @param {Object} jsonData - 包含 {pageTitle, pageUrl, extractTime, questions} 的结构化数据对象。
   * @returns {string} 所有题目的格式化文本表示。
   */
  function jsonToTxt(jsonData) {
    let out = '';
    out += `页面标题: ${jsonData.pageTitle}\n`;
    out += `页面地址: ${jsonData.pageUrl}\n`;
    out += `提取时间: ${jsonData.extractTime}\n\n`;
    jsonData.questions.forEach((q, i) => {
      out += `${q.questionNumber}${q.questionStem}\n`;
      if (q.options && Object.keys(q.options).length) {
        Object.keys(q.options).forEach(k => {
          const opt = q.options[k];
          if (typeof opt === 'string') out += `${k}. ${opt}\n`;
          else out += `${k}. ${opt.text || ''}${(opt.images && opt.images.length) ? ` [图片 ${opt.images.length}]` : ''}\n`;
        });
      }
    });
    out += `\n\n`;
    out += '解析部分\n';
    jsonData.questions.forEach((q, i) => {
      out += `${q.questionNumber}【答案】 ${q.correctAnswer}\n`;
      out += `【正确率】 ${q.correctRate}\n`;
      if (q.solution) {
        if (q.solution.analysis) {
          // 享道格式解析文本中不需要 【文段出处】 文本，若发现则去除其后的所有内容
          let analysis = q.solution.analysis;
          const srcIdx = analysis.indexOf('【文段出处】');
          if (srcIdx !== -1) analysis = analysis.substring(0, srcIdx).trim();
          out += `【解析】${analysis}\n`;
        } 
        // 图片摘要（如果有）
        if (q.images && q.images.length) {
          out += `图片:\n`;
          q.images.forEach(img => { out += ` - [${img.role}] ${img.src}\n`; });
        }
        // 嵌套列表摘要（如果有）
        if (q.nestedLists && q.nestedLists.length) {
          out += `嵌套列表(已保留结构): ${JSON.stringify(q.nestedLists)}\n`;
        }
      }
    });
    return out;
  }

  /**
   * 将结构化题目数据从 JSON 转换为用于享道的 TXT 格式。
   * @param {Object} jsonData - 包含 {pageTitle, pageUrl, extractTime, questions} 的结构化数据对象。
   * @returns {string} 所有题目的格式化文本表示。
   */
  function jsonToShareFormat(jsonData) {
    let out = '';

    jsonData.questions.forEach((q, i) => {
      out += `题干\n${q.questionNumber}${q.questionStem}\n`;
      if (q.options && Object.keys(q.options).length) {
        out += `选项\n`;
        Object.keys(q.options).forEach(k => {
          const opt = q.options[k];
          if (typeof opt === 'string') out += `${k}. ${opt}\n`;
          else out += `${k}. ${opt.text || ''}${(opt.images && opt.images.length) ? ` [图片 ${opt.images.length}]` : ''}\n`;
        });
      }
      out += `考点\n${q.solution && q.solution.keypoint ? q.solution.keypoint : '无'}\n`;
      out += `答案\n${q.correctAnswer}\n`;
      if (q.solution) {
        if (q.solution.analysis) {
          // 享道格式解析文本中不需要 【文段出处】 文本，若发现则去除其后的所有内容
          let analysis = q.solution.analysis;
          const srcIdx = analysis.indexOf('【文段出处】');
          if (srcIdx !== -1) analysis = analysis.substring(0, srcIdx).trim();
          out += `解析\n${analysis}\n`;
        }
        // 图片摘要（如果有）
        if (q.images && q.images.length) {
          out += `图片:\n`;
          q.images.forEach(img => { out += ` - [${img.role}] ${img.src}\n`; });
        }
        // 嵌套列表摘要（如果有）
        if (q.nestedLists && q.nestedLists.length) {
          out += `嵌套列表(已保留结构): ${JSON.stringify(q.nestedLists)}\n`;
        }
      }
      out += `本题结束\n`;
    });
    return out;
  }


  /**
   * 显示导出格式选择模态框并返回用户的选择。
   * @returns {Promise<string|null>} Promise 解析为 'json'、'txt'、'share'，或如果用户取消则为 null。
   */
  function buildExportUI() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fbdll-modal';
      const box = document.createElement('div');
      box.className = 'fbdll-box';
      box.innerHTML = `
        <div class="fbdll-export-title">导出格式</div>
        <div class="export-options">
          <button class="format-option active" data-format="json" aria-pressed="true">📦 <strong class="label-strong">JSON</strong><small class="label-small">结构化，适合导入</small></button>
          <button class="format-option" data-format="txt" aria-pressed="false">📄 <strong class="label-strong">TXT</strong><small class="label-small">可读文本，便于查看</small></button>
          <button class="format-option" data-format="share" aria-pressed="false">🐶 <strong class="label-strong">享道</strong><small class="label-small">享道格式，便于交差</small></button>

        </div>
        <div class="fbdll-actions">
          <button id="expCancel" class="fbdll-btn fbdll-btn-secondary">取消</button>
          <button id="expOk" class="fbdll-btn fbdll-btn-primary">确定</button>
        </div>`;
      modal.appendChild(box);
      document.body.appendChild(modal);

      const opts = box.querySelectorAll('.format-option');
      opts.forEach(btn => {
        btn.addEventListener('click', () => {
          opts.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        });
      });

      box.querySelector('#expCancel').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });

      box.querySelector('#expOk').addEventListener('click', () => {
        const activeBtn = box.querySelector('.format-option.active');
        const fmt = activeBtn ? activeBtn.dataset.format : 'json';
        modal.remove();
        resolve(fmt);
      });
    });
  }

  /**
   * 显示题目选择模态框，用户可勾选/取消勾选导出的题目。
   * @param {Array} questions - 完整题目数组。
   * @returns {Promise<number[]|null>} 选中题目的原始索引数组，或 null 表示取消。
   */
  function buildQuestionSelectionUI(questions) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fbdll-modal';
      const box = document.createElement('div');
      box.className = 'fbdll-box';
      box.innerHTML = `
        <div class="fbdll-export-title">选择要导出的题目</div>
        <div class="fbdll-question-selector">
          <div class="fbdll-selection-info">已选择 <span class="fbdll-selected-count">${questions.length}</span> / ${questions.length}</div>
          <button type="button" class="fbdll-btn fbdll-btn-secondary fbdll-select-toggle" data-mode="all">全选</button>
        </div>
        <div class="fbdll-question-list"></div>
        <div class="fbdll-actions">
          <button id="selectCancel" class="fbdll-btn fbdll-btn-secondary">取消</button>
          <button id="selectOk" class="fbdll-btn fbdll-btn-primary">导出</button>
        </div>`;
      modal.appendChild(box);
      document.body.appendChild(modal);

      const selectedCountEl = box.querySelector('.fbdll-selected-count');
      const listContainer = box.querySelector('.fbdll-question-list');
      const toggleButton = box.querySelector('.fbdll-select-toggle');
      const checkboxes = [];

      function normalizeSummary(text) {
        return text ? text.replace(/\s+/g, ' ').trim() : '';
      }

      questions.forEach((question, index) => {
        const item = document.createElement('label');
        item.className = 'fbdll-question-item';
        const title = normalizeSummary(question.questionType || question.questionNumber || `第 ${index + 1} 题`);
        const snippet = normalizeSummary((question.contentText || question.questionStem || '').slice(0, 60));
        const rateText = question.correctRate ? `正确率：${question.correctRate}` : '';
        item.innerHTML = `
          <input type="checkbox" checked data-index="${index}">
          <span class="fbdll-question-summary">
            <span class="summary-label">${question.questionNumber} ${title}${rateText ? ` · ${rateText}` : ''}</span>
            ${snippet ? `<span class="summary-text">${snippet}</span>` : ''}
          </span>`;
        listContainer.appendChild(item);
        const checkbox = item.querySelector('input');
        checkboxes.push(checkbox);
        checkbox.addEventListener('change', updateSelectionState);
      });

      function updateSelectionState() {
        const selectedCount = checkboxes.filter(chk => chk.checked).length;
        selectedCountEl.textContent = selectedCount;
        const allSelected = selectedCount === checkboxes.length;
        toggleButton.textContent = allSelected ? '反选' : '全选';
        toggleButton.dataset.mode = allSelected ? 'invert' : 'all';
      }

      toggleButton.addEventListener('click', () => {
        const allSelected = checkboxes.every(chk => chk.checked);
        if (allSelected) {
          checkboxes.forEach(chk => { chk.checked = false; });
        } else {
          checkboxes.forEach(chk => { chk.checked = true; });
        }
        updateSelectionState();
      });

      box.querySelector('#selectCancel').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });

      box.querySelector('#selectOk').addEventListener('click', () => {
        const selectedIndexes = checkboxes.filter(chk => chk.checked).map(chk => Number(chk.dataset.index));
        if (selectedIndexes.length === 0) {
          showNotification('⚠ 请选择题目', '至少选择一个题目后才能导出', 'error');
          return;
        }
        modal.remove();
        resolve(selectedIndexes);
      });
    });
  }

  /**
   * 根据用户选择的题目索引，过滤并重新编号题目数据。
   * @param {Object} jsonData - 原始结构化题目数据。
   * @param {number[]} selectedIndexes - 用户选中的题目原始索引列表。
   * @returns {Object} 过滤并重编号后的结构化数据。
   */
  function filterAndRenumberQuestions(jsonData, selectedIndexes) {
    const selectedQuestions = selectedIndexes.map((origIndex, idx) => {
      const question = jsonData.questions[origIndex];
      if (!question) return null;
      return Object.assign({}, question, {
        originalQuestionNumber: question.questionNumber,
        questionNumber: `${idx + 1}.`,
      });
    }).filter(Boolean);

    const filteredJson = Object.assign({}, jsonData, {
      totalQuestions: selectedQuestions.length,
      questions: selectedQuestions,
    });

    if (filteredJson.metadata && filteredJson.metadata.diagnosticsSummary) {
      const completeCount = selectedQuestions.filter(q => q.diagnostics && q.diagnostics.health && q.diagnostics.health.isComplete).length;
      const incompleteCount = selectedQuestions.length - completeCount;
      filteredJson.metadata.diagnosticsSummary = Object.assign({}, filteredJson.metadata.diagnosticsSummary, {
        completeCount,
        incompleteCount,
        completionRate: selectedQuestions.length > 0 ? `${(completeCount / selectedQuestions.length * 100).toFixed(2)}%` : '0%',
        problematicQuestions: selectedQuestions
          .map((q, i) => ({ index: i + 1, health: q.diagnostics && q.diagnostics.health }))
          .filter(q => q.health && q.health.hasCriticalMissing),
      });
    }

    return filteredJson;
  }

  /**
   * 从页面标题或主机名生成安全的文件名基础。
   * 如果两者都不可用，则回退到 'export'。
   * @param {string} pageTitle - 页面标题字符串。
   * @param {string} pageUrl - 页面 URL 字符串。
   * @returns {string} 清理后的文件名基础（不包含扩展名或时间戳）。
   */
  function getFilenameBase(pageTitle, pageUrl) {
    const hostname = (function () { try { return (new URL(pageUrl)).hostname; } catch (e) { return 'page'; } })();
    return sanitizeFilename(pageTitle) || sanitizeFilename(hostname) || 'export';
  }

  /**
   * 以指定格式下载提取的数据。
   * 处理 JSON 和 TXT 格式，生成包含时间戳的文件名。
   * 显示成功/错误通知。
   * @param {Object} jsonData - 结构化题目数据。
   * @param {number} parseErrors - 提取错误的计数。
   * @param {string} format - 导出格式：'json' 或 'txt'。
   */
  function downloadData(jsonData, parseErrors, format) {
    const filenameBase = getFilenameBase(jsonData.pageTitle, jsonData.pageUrl);
    const timestamp = formatTimestamp(new Date());

    if (format === 'json') {
      // JSON 导出：包含完整的诊断数据
      const filename = `${filenameBase}_${timestamp}.json`;
      const content = JSON.stringify(jsonData, null, 2);
      downloadBlob(content, filename, 'application/json;charset=utf-8');
      showNotification('✓ 导出成功', `已导出 ${jsonData.totalQuestions} 题，文件：${filename}`, 'success');
    } else if (format === 'txt') {
      // TXT 导出：移除诊断数据，保持原始格式
      const cleanJsonData = {
        pageTitle: jsonData.pageTitle,
        pageUrl: jsonData.pageUrl,
        extractTime: jsonData.extractTime,
        totalQuestions: jsonData.totalQuestions,
        questions: jsonData.questions.map(q => {
          const { diagnostics, ...rest } = q;  // 解构移除 diagnostics
          return rest;
        }),
        metadata: {
          parseErrors: jsonData.metadata.parseErrors,
          scrapeVersion: jsonData.metadata.scrapeVersion,
        },
      };
      const filename = `${filenameBase}_${timestamp}.txt`;
      const content = jsonToTxt(cleanJsonData);
      downloadBlob(content, filename, 'text/plain;charset=utf-8');
      showNotification('✓ 导出成功', `已导出 ${jsonData.totalQuestions} 题为 TXT，文件：${filename}`, 'success');
    } else if (format === 'share') {
      // 享道格式导出：仅题干和选项，适合交差
      // TXT 导出：移除诊断数据，保持原始格式
      const cleanJsonData = {
        pageTitle: jsonData.pageTitle,
        pageUrl: jsonData.pageUrl,
        extractTime: jsonData.extractTime,
        totalQuestions: jsonData.totalQuestions,
        questions: jsonData.questions.map(q => {
          const { diagnostics, ...rest } = q;  // 解构移除 diagnostics
          return rest;
        }),
        metadata: {
          parseErrors: jsonData.metadata.parseErrors,
          scrapeVersion: jsonData.metadata.scrapeVersion,
        },
      };
      const filename = `${filenameBase}_${timestamp}.txt`;
      const content = jsonToShareFormat(cleanJsonData);
      downloadBlob(content, filename, 'text/plain;charset=utf-8');
      showNotification('✓ 导出成功', `已导出 ${jsonData.totalQuestions} 题为 享道格式，文件：${filename}`, 'success');
    }


    if (parseErrors > 0) {
      showNotification('⚠ 部分解析失败', `${parseErrors} 个题目解析失败`, 'info');
    }
  }

  /**
   * 导出操作的主处理程序。
   * 协调导出流程：显示 UI → 提取数据 → 下载。
   * 使用用户友好的通知处理错误。
   */
  function handleExportAction() {
    buildExportUI().then(async (selectedFormat) => {
      if (!selectedFormat) return; // User cancelled
      try {
        const { jsonData, parseErrors } = extractQuestions();
        const selectedIndexes = await buildQuestionSelectionUI(jsonData.questions);
        if (!selectedIndexes || !selectedIndexes.length) return; // User cancelled or nothing selected
        const filteredData = filterAndRenumberQuestions(jsonData, selectedIndexes);
        downloadData(filteredData, parseErrors, selectedFormat);
      } catch (err) {
        console.error('导出失败:', err);
        showNotification('✗ 导出失败', err.message || String(err), 'error');
      }
    });
  }

  // 启动导出工作流程
  handleExportAction();
}