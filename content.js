// 监听来自扩展弹出窗口的消息
console.log('[content] 内容脚本已加载，监听消息...');

// 通知扩展已加载
try {
  chrome.runtime.sendMessage({
    action: 'contentScriptLoaded',
    timestamp: Date.now()
  }, function(response) {
    console.log('[content] 通知扩展内容脚本已加载', response || '无响应');
  });
} catch (e) {
  console.log('[content] 发送加载通知时出错:', e);
}

// 添加消息监听和响应处理
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[content] 收到消息:', request);
  
  if (request.action === 'getInputElements') {
    console.log('[content] 开始处理getInputElements请求');
    try {
      // 获取输入元素
      const elements = getAllInputElements();
      console.log('[content] 找到输入元素:', elements.length, '个');
      
      // 发送响应
      sendResponse({
        success: true,
        message: '成功获取输入元素',
        data: elements,
        elementsCount: elements.length,
        timestamp: new Date().toISOString()
      });
      
      console.log('[content] 已发送响应');
    } catch (error) {
      console.error('[content] 获取输入元素时出错:', error);
      sendResponse({
        success: false,
        message: '获取输入元素时出错: ' + error.message,
        error: error.toString(),
        stack: error.stack
      });
    }
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  if (request.action === 'ping') {
    console.log('[content] 收到ping请求');
    
    // 收集页面信息
    const info = {
      url: window.location.href,
      readyState: document.readyState,
      hasBody: !!document.body,
      elementsCount: document.getElementsByTagName('*').length,
      inputsCount: document.querySelectorAll('input,textarea,select').length,
      timestamp: new Date().toISOString()
    };
    
    console.log('[content] 发送ping响应:', info);
    sendResponse({
      success: true,
      message: 'Content脚本已加载',
      info: info
    });
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 如果不是已知的消息类型，记录警告并返回错误
  console.warn('[content] 未知的消息类型:', request.action);
  sendResponse({ 
    success: false, 
    message: '未知的消息类型: ' + request.action 
  });
  
  // 返回true表示将异步发送响应
  return true;
});

// 获取当前页面的所有表单字段
function collectFormFields() {
  const formElements = document.querySelectorAll('input, textarea, select');
  const fields = [];
  
  formElements.forEach(element => {
    // 跳过隐藏、禁用或只读字段
    if (element.type === 'hidden' || element.disabled || element.readOnly) {
      return;
    }
    
    let label = '';
    let fieldName = '';
    
    // 1. 尝试通过关联的label元素获取标签文本
    if (element.id) {
      const labelElement = document.querySelector(`label[for="${element.id}"]`);
      if (labelElement) {
        label = labelElement.textContent.trim();
      }
    }
    
    // 2. 尝试通过labels属性获取标签
    if (!label && element.labels && element.labels.length > 0) {
      label = element.labels[0].textContent.trim();
    }
    
    // 3. 尝试查找相邻的标签元素
    if (!label) {
      const prevSibling = element.previousElementSibling;
      if (prevSibling && 
          (prevSibling.tagName === 'LABEL' || 
           prevSibling.tagName === 'SPAN' || 
           prevSibling.tagName === 'DIV')) {
        label = prevSibling.textContent.trim();
      }
    }
    
    // 4. 尝试查找父元素内的可能标签
    if (!label && element.parentElement) {
      const parentLabels = element.parentElement.querySelectorAll('label, span.label, div.label');
      if (parentLabels.length > 0) {
        label = parentLabels[0].textContent.trim();
      }
    }
    
    // 5. 使用元素的属性作为备选标签
    if (!label) {
      label = element.placeholder || element.name || element.id || '';
    }
    
    // 清理标签文本（去除冒号、星号等符号）
    label = label.replace(/[:：*＊(（].*$/, '').trim();
    
    // 尝试识别常见字段类型
    fieldName = identifyField(element);
    
    if (label || fieldName) {
      fields.push({
        element: element.tagName.toLowerCase(),
        type: element.type || '',
        id: element.id || '',
        name: element.name || '',
        label: label,
        fieldType: fieldName || '未知',
        placeholder: element.placeholder || ''
      });
    }
  });
  
  return fields;
}

// 填写表单字段
function fillFormFields(data) {
  // 跟踪填写统计
  const stats = {
    total: Object.keys(data).length,
    filled: 0,
    skipped: 0
  };
  
  // 要填写的表单元素类型
  const formElements = document.querySelectorAll('input, textarea, select');
  if (formElements.length === 0) {
    return { 
      success: false, 
      error: '当前页面未检测到表单元素' 
    };
  }
  
  const fieldsMap = createFieldsMap(data);
  const filledFields = new Set();
  
  // 遍历所有表单元素并尝试填写
  formElements.forEach(element => {
    // 跳过隐藏、禁用或只读字段
    if (element.type === 'hidden' || element.disabled || element.readOnly) {
      return;
    }
    
    // 跳过已填写的字段
    if (elementHasValue(element)) {
      return;
    }
    
    // 尝试识别字段并填写
    const fieldName = identifyField(element);
    if (fieldName && fieldsMap.has(fieldName) && !filledFields.has(fieldName)) {
      const value = fieldsMap.get(fieldName);
      
      if (fillElement(element, value)) {
        stats.filled++;
        filledFields.add(fieldName);
        
        // 触发输入事件，以便网站可以检测到值的变化
        triggerInputEvent(element);
      }
    }
  });
  
  stats.skipped = stats.total - stats.filled;
  
  // 返回填写结果
  return {
    success: stats.filled > 0,
    stats: stats,
    message: `已填写 ${stats.filled} 个字段，跳过 ${stats.skipped} 个字段`
  };
}

// 根据多种属性识别字段类型
function identifyField(element) {
  // 可能包含字段信息的属性
  const attrs = ['name', 'id', 'placeholder', 'aria-label', 'title', 'for'];
  let fieldText = '';
  
  // 检查所有可能的属性
  for (const attr of attrs) {
    if (element[attr]) {
      fieldText = element[attr].toLowerCase();
      break;
    }
  }
  
  // 没有找到有用的属性值，尝试检查相邻的标签
  if (!fieldText) {
    // 获取表单元素的相关标签
    let label = element.labels && element.labels.length > 0 
      ? element.labels[0]
      : document.querySelector(`label[for="${element.id}"]`);
    
    // 如果没有直接关联的标签，尝试查找附近的标签或文本
    if (!label) {
      const parent = element.parentElement;
      label = parent ? parent.querySelector('label') : null;
      
      if (!label) {
        // 查找上一个相邻元素，它可能是标签文本
        const prevSibling = element.previousElementSibling;
        if (prevSibling) {
          fieldText = prevSibling.textContent.toLowerCase();
        }
      }
    }
    
    if (label && !fieldText) {
      fieldText = label.textContent.toLowerCase();
    }
  }
  
  // 检查各种常见的字段类型模式
  if (/姓名|名字|联系人|full\s*name|name|用户名|用户/i.test(fieldText)) {
    return 'name';
  } else if (/手机|电话|联系方式|phone|mobile|tel|telephone/i.test(fieldText)) {
    return 'phone';
  } else if (/邮箱|电子邮件|email|mail|e-mail/i.test(fieldText)) {
    return 'email';
  } else if (/地址|address|详细地址|收货地址/i.test(fieldText)) {
    return 'address';
  } else if (/城市|city/i.test(fieldText)) {
    return 'city';
  } else if (/省份|省|province|state/i.test(fieldText)) {
    return 'province';
  } else if (/国家|country/i.test(fieldText)) {
    return 'country';
  } else if (/邮编|zip|postal|postcode|zip\s*code|postal\s*code/i.test(fieldText)) {
    return 'zipcode';
  } else if (/公司|单位|company|organization/i.test(fieldText)) {
    return 'company';
  } else if (/职位|title|job|position/i.test(fieldText)) {
    return 'title';
  } else if (/生日|出生日期|birthday|birth|date of birth/i.test(fieldText)) {
    return 'birthday';
  } else if (/性别|gender|sex/i.test(fieldText)) {
    return 'gender';
  } else if (/证件|身份证|idcard|id card|identification/i.test(fieldText)) {
    return 'idcard';
  }
  
  return null;
}

// 创建字段映射表，包括可能的变种
function createFieldsMap(data) {
  const map = new Map();
  
  // 为每个字段创建映射，包括常见的别名
  for (const [key, value] of Object.entries(data)) {
    map.set(key.toLowerCase(), value);
    
    // 添加常见别名
    if (key.toLowerCase() === 'name') {
      map.set('姓名', value);
      map.set('全名', value);
      map.set('用户名', value);
    } else if (key.toLowerCase() === 'phone') {
      map.set('电话', value);
      map.set('手机', value);
      map.set('手机号', value);
      map.set('手机号码', value);
      map.set('联系电话', value);
      map.set('mobile', value);
      map.set('tel', value);
      map.set('telephone', value);
    } else if (key.toLowerCase() === 'email') {
      map.set('邮箱', value);
      map.set('电子邮件', value);
      map.set('邮件', value);
      map.set('mail', value);
      map.set('e-mail', value);
    } else if (key.toLowerCase() === 'address') {
      map.set('地址', value);
      map.set('详细地址', value);
      map.set('收货地址', value);
    }
  }
  
  return map;
}

// 根据元素类型填充值
function fillElement(element, value) {
  if (!element || !value) return false;
  
  const tagName = element.tagName.toLowerCase();
  const type = element.type ? element.type.toLowerCase() : '';
  
  if (tagName === 'input') {
    if (type === 'checkbox' || type === 'radio') {
      // 对于复选框和单选按钮，尝试根据值匹配
      const valueMatch = element.value.toLowerCase() === String(value).toLowerCase();
      const labelMatch = element.parentElement && 
                         element.parentElement.textContent.toLowerCase().includes(String(value).toLowerCase());
      
      if (valueMatch || labelMatch) {
        element.checked = true;
        return true;
      }
      return false;
    } else if (type === 'date') {
      // 处理日期输入
      try {
        const dateValue = formatDate(value);
        if (dateValue) {
          element.value = dateValue;
          return true;
        }
      } catch (e) {
        console.error('日期格式化失败:', e);
      }
      return false;
    } else {
      // 对于文本、邮件、电话等类型
      element.value = value;
      return true;
    }
  } else if (tagName === 'textarea') {
    element.value = value;
    return true;
  } else if (tagName === 'select') {
    // 对于下拉菜单，尝试找到匹配的选项
    return setSelectValue(element, value);
  }
  
  return false;
}

// 为选择框设置值
function setSelectValue(selectElement, value) {
  const options = Array.from(selectElement.options);
  const strValue = String(value).toLowerCase();
  
  // 尝试通过值或文本找到匹配的选项
  const matchingOption = options.find(option => 
    option.value.toLowerCase() === strValue || 
    option.text.toLowerCase() === strValue ||
    option.text.toLowerCase().includes(strValue)
  );
  
  if (matchingOption) {
    selectElement.value = matchingOption.value;
    return true;
  }
  
  return false;
}

// 格式化日期值
function formatDate(value) {
  // 尝试将各种格式的日期字符串转换为yyyy-mm-dd格式
  if (!value) return '';
  
  // 如果已经是yyyy-mm-dd格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (e) {
    return '';
  }
}

// 检查元素是否已有值
function elementHasValue(element) {
  if (!element) return false;
  
  const type = element.type ? element.type.toLowerCase() : '';
  
  if (type === 'checkbox' || type === 'radio') {
    return element.checked;
  } else if (element.tagName.toLowerCase() === 'select') {
    return element.selectedIndex > 0;
  } else {
    return element.value.trim().length > 0;
  }
}

// 触发输入事件
function triggerInputEvent(element) {
  if (!element) return;
  
  // 创建并分发输入事件
  const inputEvent = new Event('input', { bubbles: true });
  element.dispatchEvent(inputEvent);
  
  // 创建并分发变更事件
  const changeEvent = new Event('change', { bubbles: true });
  element.dispatchEvent(changeEvent);
}

// 获取页面上的所有input元素信息
function getAllInputElements() {
  console.log('[content] 开始收集所有输入元素');
  
  // 使用querySelectorAll获取所有表单元素
  const inputs = document.querySelectorAll('input, textarea, select');
  console.log('[content] 页面表单元素数量:', inputs.length);
  
  // 转换为数组并过滤收集信息
  const inputElements = Array.from(inputs).map((input, index) => {
    // 输出调试信息
    console.log(`[content] 处理第${index+1}个元素:`, 
      input.tagName, 
      input.type || '', 
      input.id || '无ID', 
      input.name || '无name'
    );
    
    // 收集元素信息
    const info = {
      type: input.type || input.tagName.toLowerCase(),
      id: input.id || '',
      name: input.name || '',
      visible: isElementVisible(input),
      xpath: getElementXPath(input),
      tagName: input.tagName.toLowerCase(),
      value: input.value || '',
      placeholder: input.placeholder || '',
      required: input.required || false
    };
    
    // 尝试查找相邻的标签文本
    try {
      const textFinder = new TextFinder(input);
      const nearTexts = textFinder.findNearbyTexts();
      info.nearTexts = nearTexts;
      
      // 如果有相邻文本，尝试推断字段名称
      if (nearTexts && nearTexts.length > 0) {
        info.fieldName = inferFieldName(nearTexts, input);
      } else {
        // 如果没有相邻文本，尝试从其他属性推断
        info.fieldName = inferFieldNameFromAttributes(input);
      }
    } catch (e) {
      console.error('[content] 获取相邻文本出错:', e);
      info.nearTexts = [];
      info.fieldName = '';
    }
    
    return info;
  });
  
  console.log('[content] 收集完成，共找到', inputElements.length, '个输入元素');
  return inputElements;
}

// 检查元素是否可见
function isElementVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 && 
         element.offsetHeight > 0;
}

// 获取元素的XPath
function getElementXPath(element) {
  if (!element) return '';
  
  try {
    // 简单实现，生成XPath
    let path = '';
    while (element && element.nodeType === 1) {
      let index = 1;
      let sibling = element.previousSibling;
      
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      
      const tagName = element.tagName.toLowerCase();
      const pathIndex = (index > 1) ? `[${index}]` : '';
      path = `/${tagName}${pathIndex}${path}`;
      
      // 如果元素有ID，使用ID简化XPath
      if (element.id) {
        path = `//${tagName}[@id="${element.id}"]`;
        break;
      }
      
      element = element.parentNode;
    }
    
    return path || '无法生成XPath';
  } catch (error) {
    console.error('[content] 生成XPath出错:', error);
    return '生成XPath时出错';
  }
}

// 辅助类 - 用于查找元素附近的文本
class TextFinder {
  constructor(element) {
    this.element = element;
    this.processedNodes = new Set();
    this.maxResults = 5; // 增加最大结果数量
  }
  
  findNearbyTexts() {
    console.log('[content] 查找元素附近文本:', this.element.tagName, this.element.id || '无ID');
    const texts = [];
    
    // 1. 尝试找关联label
    const id = this.element.id;
    if (id) {
      const labels = document.querySelectorAll(`label[for="${id}"]`);
      if (labels && labels.length > 0) {
        for (const label of labels) {
          const text = label.textContent.trim();
          if (text) {
            console.log('[content] 找到label文本:', text);
            texts.push(text);
          }
        }
      }
    }
    
    // 2. 查找包裹input的label
    if (this.element.closest('label')) {
      const wrapperLabel = this.element.closest('label');
      const text = this.extractTextFromNode(wrapperLabel, this.element);
      if (text) {
        console.log('[content] 找到包裹label文本:', text);
        texts.push(text);
      }
    }
    
    // 3. 检查父元素内的文本
    let parent = this.element.parentElement;
    if (parent) {
      const text = this.extractTextFromNode(parent, this.element);
      if (text) {
        console.log('[content] 找到父元素文本:', text);
        texts.push(text);
      }
    }
    
    // 4. 查找同级元素中的文本
    this.findAdjacentTexts(this.element, texts);
    
    // 5. 查找placeholder作为备选
    const placeholder = this.element.getAttribute('placeholder');
    if (placeholder && placeholder.trim() && !texts.includes(placeholder.trim())) {
      console.log('[content] 找到placeholder:', placeholder);
      texts.push(placeholder.trim());
    }
    
    // 6. 查找title/aria-label作为备选
    const ariaLabel = this.element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim() && !texts.includes(ariaLabel.trim())) {
      console.log('[content] 找到aria-label:', ariaLabel);
      texts.push(ariaLabel.trim());
    }
    
    const title = this.element.getAttribute('title');
    if (title && title.trim() && !texts.includes(title.trim())) {
      console.log('[content] 找到title:', title);
      texts.push(title.trim());
    }
    
    // 记录结果
    if (texts.length > 0) {
      console.log('[content] 找到的相关文本:', texts);
    } else {
      console.log('[content] 未找到任何相关文本');
    }
    
    return texts.slice(0, this.maxResults);
  }
  
  findAdjacentTexts(element, texts) {
    if (texts.length >= this.maxResults) return;
    
    // 向上查找兄弟元素
    let sibling = element.previousElementSibling;
    let siblingCount = 0;
    
    while (sibling && texts.length < this.maxResults && siblingCount < 3) {
      const text = this.extractTextFromNode(sibling);
      if (text && !texts.includes(text)) {
        console.log('[content] 找到相邻元素文本:', text);
        texts.push(text);
      }
      sibling = sibling.previousElementSibling;
      siblingCount++;
    }
    
    // 如果还需要更多文本，尝试查找父元素的前一个兄弟
    if (texts.length < this.maxResults && element.parentElement && !this.processedNodes.has(element.parentElement)) {
      this.findAdjacentTexts(element.parentElement, texts);
    }
  }
  
  extractTextFromNode(element, excludeElement = null) {
    if (!element || this.processedNodes.has(element)) return '';
    this.processedNodes.add(element);
    
    // 获取元素直接包含的文本（不含子元素的文本）
    let textContent = '';
    
    // 首先尝试获取直接的文本节点
    for (const node of element.childNodes) {
      if (node === excludeElement || 
          (excludeElement && excludeElement.contains && excludeElement.contains(node))) {
        continue;
      }
      
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent.trim();
        if (nodeText) textContent += nodeText + ' ';
      }
    }
    
    // 如果直接文本为空但元素有子元素，尝试收集前面的子元素文本
    if (!textContent && element.children.length > 0 && excludeElement) {
      for (const child of element.children) {
        if (child === excludeElement || 
            (excludeElement.contains && excludeElement.contains(child)) ||
            (child.contains && child.contains(excludeElement))) {
          break; // 到达目标元素，停止收集
        }
        
        const childText = child.textContent.trim();
        if (childText) textContent += childText + ' ';
      }
    }
    
    return textContent.trim();
  }
}

// 从文本推断字段名称
function inferFieldName(texts, element) {
  if (!texts || texts.length === 0) return '';
  
  // 简单处理：取第一个文本作为字段名
  let fieldName = texts[0];
  
  // 去掉常见的后缀符号
  fieldName = fieldName.replace(/[:：*？\?\(\)（）]+$/, '').trim();
  
  // 如果字段名太长，尝试截取合理长度
  if (fieldName.length > 30) {
    fieldName = fieldName.substring(0, 30) + '...';
  }
  
  return fieldName;
}

// 从属性推断字段名称
function inferFieldNameFromAttributes(element) {
  // 尝试从各种属性中推断
  const possibleAttributes = [
    element.placeholder,
    element.title,
    element.name,
    element.id,
    element.getAttribute('aria-label')
  ];
  
  for (const attr of possibleAttributes) {
    if (attr && typeof attr === 'string' && attr.trim()) {
      return attr.trim();
    }
  }
  
  // 如果都没有，返回一个基于类型的通用名称
  return element.type ? `${element.type}字段` : '未知字段';
}

// 发送输入元素信息到扩展
function sendInputElementsToExtension() {
  // 检查chrome.runtime是否可用
  if (!chrome.runtime) {
    console.log('扩展上下文已失效，停止观察');
    if (observer) {
      observer.disconnect();
    }
    return;
  }

  try {
    const inputsData = getAllInputElements();
    chrome.runtime.sendMessage({
      action: 'updateInputElements',
      data: inputsData
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.log('发送消息时出错，停止观察:', chrome.runtime.lastError);
        if (observer) {
          observer.disconnect();
        }
      }
    });
  } catch (error) {
    console.log('获取或发送输入元素数据时出错:', error);
    if (observer) {
      observer.disconnect();
    }
  }
}

// 在页面加载完成后自动获取并发送元素信息
window.addEventListener('load', function() {
  if (chrome.runtime) {
    setTimeout(sendInputElementsToExtension, 1000); // 延迟1秒确保页面完全加载
  }
});

// 监听DOM变化，当页面元素发生变化时重新获取input信息
const observer = new MutationObserver(function(mutations) {
  // 检查扩展上下文是否有效
  if (!chrome.runtime) {
    console.log('扩展上下文已失效，停止观察');
    observer.disconnect();
    return;
  }

  // 判断变化是否涉及表单元素
  let formElementsChanged = false;
  
  try {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'attributes') {
        formElementsChanged = true;
        break;
      }
    }
    
    if (formElementsChanged) {
      sendInputElementsToExtension();
    }
  } catch (error) {
    console.log('处理DOM变化时出错:', error);
    observer.disconnect();
  }
});

// 配置观察选项
try {
  observer.observe(document.body, {
    childList: true,  // 监视目标子节点的添加或删除
    subtree: true,    // 监视所有后代节点
    attributes: true, // 监视属性更改
    attributeFilter: ['id', 'name', 'style', 'class'] // 仅监视这些属性的变化
  });
} catch (error) {
  console.log('启动DOM观察时出错:', error);
} 