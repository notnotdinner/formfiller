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
  
  // 处理登录请求
  if (request.action === 'login') {
    console.log('[content] 接收到登录请求');
    
    window.loginManager.login(request.credentials)
      .then(success => {
        sendResponse({
          success: success,
          message: success ? '登录成功' : '登录失败',
          timestamp: new Date().toISOString()
        });
      })
      .catch(error => {
        sendResponse({
          success: false,
          message: '登录过程中出错: ' + error.message,
          error: error.toString()
        });
      });
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 处理登出请求
  if (request.action === 'logout') {
    console.log('[content] 接收到登出请求');
    
    window.loginManager.logout();
    sendResponse({
      success: true,
      message: '已成功登出',
      timestamp: new Date().toISOString()
    });
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 处理登录状态检查请求
  if (request.action === 'checkLoginStatus') {
    console.log('[content] 接收到检查登录状态请求');
    
    // 异步检查登录状态
    window.loginManager.checkLoginStatus()
      .then(isLoggedIn => {
        // 从credentials获取用户名
        let username = null;
        if (isLoggedIn && window.loginManager.credentials) {
          username = window.loginManager.credentials.username;
        }
        
        sendResponse({
          success: true,
          isLoggedIn: isLoggedIn,
          username: username,
          message: isLoggedIn ? '用户已登录' : '用户未登录',
          timestamp: new Date().toISOString()
        });
      })
      .catch(error => {
        console.error('[content] 检查登录状态时出错:', error);
        sendResponse({
          success: false,
          error: error.toString(),
          message: '检查登录状态时出错'
        });
      });
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 处理自动填充登录表单请求
  if (request.action === 'autoFillLoginForm') {
    console.log('[content] 接收到自动填充登录表单请求');
    
    const elements = getAllInputElements();
    const result = window.loginManager.autoFillLoginForm(elements);
    
    sendResponse({
      success: result,
      message: result ? '成功填充登录表单' : '无法填充登录表单',
      timestamp: new Date().toISOString()
    });
    
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
  
  // 处理登录状态更新请求
  if (request.action === 'updateLoginState') {
    console.log('[content] 接收到更新登录状态请求');
    
    try {
      // 直接更新loginManager的状态
      if (request.loginState) {
        window.loginManager.isLoggedIn = request.loginState.isLoggedIn;
        window.loginManager.lastLoginTime = request.loginState.lastLoginTime;
        window.loginManager.credentials = {
          username: request.loginState.userIdentifier,
          password: request.loginState.password
        };
        
        console.log('[content] 登录状态已更新为:', window.loginManager.isLoggedIn ? '已登录' : '未登录');
        
        sendResponse({
          success: true,
          message: '登录状态已更新'
        });
      } else {
        console.error('[content] 收到的登录状态数据无效');
        sendResponse({
          success: false,
          message: '登录状态数据无效'
        });
      }
    } catch (error) {
      console.error('[content] 更新登录状态时出错:', error);
      sendResponse({
        success: false,
        error: error.toString()
      });
    }
    
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
      // 使用新的方法查找前面的可见文本
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
      console.error('[content] 获取前面文本出错:', e);
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
  
  // 文本节点直接返回true，因为它们的可见性取决于父元素
  if (element.nodeType === Node.TEXT_NODE) {
    // 确保文本内容不为空
    return element.textContent.trim() !== '';
  }
  
  // 元素节点的可见性检查
  try {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 && 
           element.offsetHeight > 0;
  } catch (e) {
    return false;
  }
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
    this.maxResults = 3; // 设置最多返回3个文本
  }
  
  findNearbyTexts() {
    console.log('[content] 开始查找元素周围的显示文本:', this.element.tagName, this.element.id || '无ID');
    
    // 前面的文本
    const textsBefore = [];
    // 1. 从元素开始，查找前面的文本节点
    this.findVisibleTextsBeforeElement(this.element, textsBefore);
    
    // 2. 查找关联的label（这是明确与input关联的文本）
    const id = this.element.id;
    if (id && textsBefore.length < this.maxResults) {
      const labels = document.querySelectorAll(`label[for="${id}"]`);
      if (labels && labels.length > 0) {
        for (const label of labels) {
          if (isElementVisible(label)) {
            const text = label.textContent.trim();
            if (text && !textsBefore.includes(text)) {
              console.log('[content] 找到label文本:', text);
              textsBefore.push(text);
              if (textsBefore.length >= this.maxResults) break;
            }
          }
        }
      }
    }
    
    // 3. 如果是嵌套在label中的input，提取label的文本
    if (textsBefore.length < this.maxResults && this.element.closest('label')) {
      const wrapperLabel = this.element.closest('label');
      // 只提取label中input之前的文本
      const text = this.getTextBeforeElementInParent(this.element, wrapperLabel);
      if (text && !textsBefore.includes(text)) {
        console.log('[content] 找到包裹label文本:', text);
        textsBefore.push(text);
      }
    }
    
    // 4. 如果仍未找到足够的文本，尝试从DOM位置查找
    if (textsBefore.length < this.maxResults) {
      this.findPrecedingTextNodesByPosition(this.element, textsBefore);
    }
    
    // 记录前面的文本结果
    if (textsBefore.length > 0) {
      console.log('[content] 找到的元素前面的文本:', textsBefore);
    } else {
      console.log('[content] 未找到元素前面的文本');
    }
    
    // 后面的文本
    const textsAfter = [];
    // 5. 查找元素后面的文本
    this.findVisibleTextsAfterElement(this.element, textsAfter);
    
    // 记录后面的文本结果
    if (textsAfter.length > 0) {
      console.log('[content] 找到的元素后面的文本:', textsAfter);
    } else {
      console.log('[content] 未找到元素后面的文本');
    }
    
    return {
      before: textsBefore,
      after: textsAfter
    };
  }
  
  // 查找元素前面的可见文本节点
  findVisibleTextsBeforeElement(element, texts) {
    if (texts.length >= this.maxResults) return;
    
    // 从父元素开始
    let parent = element.parentElement;
    if (!parent) return;
    
    // 获取所有子节点
    const children = Array.from(parent.childNodes);
    let foundElement = false;
    
    // 逆序遍历，找到元素后停止
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      
      // 如果找到了当前元素，标记开始收集前面的文本
      if (child === element) {
        foundElement = true;
        continue;
      }
      
      // 找到元素后，开始收集前面的文本节点
      if (foundElement) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent.trim();
          if (text && !texts.includes(text)) {
            texts.push(text);
            if (texts.length >= this.maxResults) return;
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (isElementVisible(child)) {
            const textContent = child.textContent.trim();
            if (textContent && !texts.includes(textContent)) {
              texts.push(textContent);
              if (texts.length >= this.maxResults) return;
            }
          }
        }
      }
    }
    
    // 如果在当前父元素中没有找到足够的文本，继续向上查找
    if (texts.length < this.maxResults && parent.parentElement) {
      this.findVisibleTextsBeforeElement(parent, texts);
    }
  }
  
  // 通过DOM位置查找前面的文本节点
  findPrecedingTextNodesByPosition(element, texts) {
    if (texts.length >= this.maxResults) return;
    
    console.log('[content] 使用位置查找元素前面的文本...');
    
    // 获取元素在页面上的位置
    const rect = element.getBoundingClientRect();
    console.log('[content] 目标元素位置:', 
      'top:', rect.top, 
      'left:', rect.left, 
      'bottom:', rect.bottom, 
      'right:', rect.right
    );
    
    // 查找所有文本节点
    const textNodes = [];
    this.getAllTextNodes(document.body, textNodes);
    console.log('[content] 找到可见文本节点总数:', textNodes.length);
    
    // 过滤和排序前面的文本节点
    const precedingTextNodes = textNodes
      .filter(nodeInfo => {
        // 获取节点位置
        try {
          const nodeRect = nodeInfo.element.getBoundingClientRect();
          
          // 筛选位置合适的节点（在input前面）
          // 1. 在input上方
          const isAbove = nodeRect.bottom < rect.top;
          
          // 2. 在input左侧且大致在同一高度
          const isLeft = nodeRect.right < rect.left && 
                         Math.abs(nodeRect.bottom - rect.bottom) < 100;
          
          // 3. 在input附近（考虑表单布局）
          const isNearby = Math.abs(nodeRect.left - rect.left) < 300 && 
                           nodeRect.bottom < rect.top + 50 && 
                           nodeRect.bottom > rect.top - 150;
          
          const result = isAbove || isLeft || isNearby;
          
          if (result) {
            console.log('[content] 找到符合位置的文本:', 
                       nodeInfo.text,
                       'top:', nodeRect.top, 
                       'left:', nodeRect.left);
          }
          
          return result;
        } catch (e) {
          return false;
        }
      })
      .sort((a, b) => {
        // 计算到input的距离，优先考虑垂直和水平接近的元素
        try {
          const aRect = a.element.getBoundingClientRect();
          const bRect = b.element.getBoundingClientRect();
          
          // 水平距离
          const aHorizontalDist = Math.abs(aRect.left - rect.left);
          const bHorizontalDist = Math.abs(bRect.left - rect.left);
          
          // 垂直距离（越接近越好）
          const aVerticalDist = rect.top - aRect.bottom;
          const bVerticalDist = rect.top - bRect.bottom;
          
          // 如果垂直距离差异很大，优先考虑更接近的
          if (Math.abs(aVerticalDist - bVerticalDist) > 50) {
            // 如果两者都在上方，优先考虑更近的
            if (aVerticalDist > 0 && bVerticalDist > 0) {
              return aVerticalDist - bVerticalDist;
            }
          }
          
          // 否则，优先考虑水平位置相近的
          return aHorizontalDist - bHorizontalDist;
        } catch (e) {
          return 0;
        }
      });
    
    console.log('[content] 找到符合位置的文本节点数:', precedingTextNodes.length);
    
    // 取最近的几个文本节点
    let addedCount = 0;
    for (const nodeInfo of precedingTextNodes) {
      if (texts.length >= this.maxResults) break;
      
      const text = nodeInfo.text.trim();
      if (text && !texts.includes(text)) {
        console.log('[content] 通过位置找到文本:', text);
        texts.push(text);
        addedCount++;
      }
    }
    
    console.log('[content] 通过位置添加了', addedCount, '个文本');
  }
  
  // 获取所有文本节点
  getAllTextNodes(root, results) {
    // 如果root是元素节点但不可见，则跳过
    if (root.nodeType === Node.ELEMENT_NODE && !isElementVisible(root)) {
      return;
    }
    
    // 如果是文本节点且内容有效，收集它
    if (root.nodeType === Node.TEXT_NODE) {
      const text = root.textContent.trim();
      if (text) {
        const parent = root.parentElement || document.body;
        if (isElementVisible(parent)) {
          results.push({
            text: text,
            element: parent
          });
        }
      }
      return;
    }
    
    // 忽略脚本、样式和其他非显示元素
    if (root.nodeType === Node.ELEMENT_NODE) {
      const tagName = root.tagName.toUpperCase();
      if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' || 
          tagName === 'META' || tagName === 'LINK' || tagName === 'HEAD') {
        return;
      }
    }
    
    // 递归处理所有子节点
    for (const child of root.childNodes) {
      this.getAllTextNodes(child, results);
    }
  }
  
  // 获取父元素中当前元素之前的文本
  getTextBeforeElementInParent(element, parent) {
    let result = '';
    let foundElement = false;
    
    // 从后往前遍历父元素的子节点
    for (let i = parent.childNodes.length - 1; i >= 0; i--) {
      const node = parent.childNodes[i];
      
      if (node === element || node.contains(element)) {
        foundElement = true;
        continue;
      }
      
      if (foundElement) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) result = text + ' ' + result;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const text = node.textContent.trim();
          if (text) result = text + ' ' + result;
        }
      }
    }
    
    return result.trim();
  }
  
  // 获取元素后面的文本
  findVisibleTextsAfterElement(element, texts) {
    if (!element || texts.length >= this.maxResults) return;
    
    console.log('[content] 寻找元素后面的文本:', element.tagName);
    
    // 1. 首先尝试获取元素的下一个同级节点
    let nextSibling = element.nextSibling;
    while (nextSibling && texts.length < this.maxResults) {
      if (nextSibling.nodeType === Node.TEXT_NODE) {
        const text = nextSibling.textContent.trim();
        if (text && !texts.includes(text)) {
          texts.push(text);
          console.log('[content] 找到后面的文本节点:', text);
        }
      } else if (nextSibling.nodeType === Node.ELEMENT_NODE && isElementVisible(nextSibling)) {
        const text = nextSibling.textContent.trim();
        if (text && !texts.includes(text)) {
          texts.push(text);
          console.log('[content] 找到后面的元素节点文本:', text);
        }
      }
      nextSibling = nextSibling.nextSibling;
    }
    
    // 2. 如果还没找到足够的文本，递归向上找父元素的后续元素
    if (texts.length < this.maxResults && element.parentNode && element.parentNode !== document.body) {
      // 找到父元素节点中当前元素的下一个兄弟节点
      const parent = element.parentNode;
      const parentNextSibling = parent.nextSibling;
      
      if (parentNextSibling) {
        this.findTextInNode(parentNextSibling, texts);
      }
      
      // 递归向上查找
      this.findVisibleTextsAfterElement(parent, texts);
    }
  }
  
  // 辅助函数：从节点中提取文本
  findTextInNode(node, texts) {
    if (!node || texts.length >= this.maxResults) return;
    
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text && !texts.includes(text)) {
        texts.push(text);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && isElementVisible(node)) {
      // 如果是可见的元素节点
      if (node.childNodes.length === 0) {
        const text = node.textContent.trim();
        if (text && !texts.includes(text)) {
          texts.push(text);
        }
      } else {
        // 遍历子节点
        for (let i = 0; i < node.childNodes.length && texts.length < this.maxResults; i++) {
          this.findTextInNode(node.childNodes[i], texts);
        }
      }
    }
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

// 为所有输入元素添加XPath按钮
function addXPathButtonsToInputs() {
  console.log('[content] 开始为输入元素添加Autofill按钮');
  
  // 获取所有输入元素
  const inputs = document.querySelectorAll('input, textarea, select');
  
  // 为每个输入元素添加按钮
  inputs.forEach((input, index) => {
    // 创建按钮
    const button = document.createElement('button');
    
    // 使用内联的星星图片
    button.innerHTML = '';
    button.title = '点击自动填充此表单元素';
    button.style.cssText = `
      font-size: 11px;
      padding: 2px 5px;
      margin-left: 5px;
      background: #4285f4 url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAABTUlEQVR4nGNgGLRAWU3jv7KaxsXKahoe5OhXVtP4DwI5OTmMymoaC0jRD9I7H6QXZgApBqAbjG4zmguwGwL3ynPQ44GBgYEhJT8P5JV/yjkdYC+ANCvnVMB5Rk4HmDQIDPY7sAFKDNDg2YkJIPWfGRgYrKFe+QTiWYDE8zD9ID7IgE8MA/4zomnEZogdw4D/IAYjI6MpTAII/AcZ9B9qO0w9I9SAzwwwA6Y8fQeyYD4DA0M7mgH/oS4QVVPVQDfAG2rAAqgBHmhu9UbTvwA5DMBxoKSiwsDAwAAyIB2LF86jue09ugHoXvDG8MI11AAQALnuItQLF5EMuA+VXQA1YD6aAQtgBiiraTxHMsAYzYCN6Hp5eXkZldU07kO9AdIPCqTNUBfEQQ2bjqZfF5qQNkMNs0USr4eK6aK54T8skcBcQXFCYqACAAZMxfAJOwMGAAAAAElFTkSuQmCC') no-repeat center center;
      background-size: 16px 16px;
      color: transparent;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      position: relative;
      z-index: 9999;
      width: 25px;
      height: 25px;
      min-width: 25px;
      min-height: 25px;
    `;
    
    // 添加点击事件
    button.addEventListener('click', function(event) {
      event.stopPropagation();
      
      // 获取元素XPath
      const xpath = getElementXPath(input);
      console.log('[content] 元素XPath:', xpath);
      
      // 获取元素前后的文本
      const textFinder = new TextFinder(input);
      const texts = textFinder.findNearbyTexts();
      
      // 创建文本内容
      let contentHTML = '';
      
      // 添加前面文本
      contentHTML += '<div style="margin-bottom:10px;"><strong>前面的文本:</strong><ul style="margin:5px 0;padding-left:20px;">';
      if (texts.before.length > 0) {
        texts.before.forEach(text => {
          contentHTML += `<li>"${text}"</li>`;
        });
      } else {
        contentHTML += '<li>未找到文本</li>';
      }
      contentHTML += '</ul></div>';
      
      // 添加后面文本
      contentHTML += '<div><strong>后面的文本:</strong><ul style="margin:5px 0;padding-left:20px;">';
      if (texts.after.length > 0) {
        texts.after.forEach(text => {
          contentHTML += `<li>"${text}"</li>`;
        });
      } else {
        contentHTML += '<li>未找到文本</li>';
      }
      contentHTML += '</ul></div>';

      console.log(contentHTML);

      // 不要尝试直接获取textInput元素，因为content.js和popup.js运行在不同的环境
      // 而是通过消息传递请求textInput的内容
      chrome.runtime.sendMessage({
        action: 'getTextInputContent'
      }, function(response) {
        if (response && response.success) {
          const content = response.content || '';
          console.log('[content] 从popup获取的文本框内容:', content);
          
          // 异步检查登录状态
          window.loginManager.checkLoginStatus()
            .then(isLoggedIn => {
              if (!isLoggedIn) {
                console.error('[content] 用户未登录，无法发送请求');
                // 通知popup显示登录提示
                chrome.runtime.sendMessage({
                  action: 'showLoginRequired',
                  message: '请先登录后再提取字段'
                });
                return;
              }
              
              // 用户已登录，继续执行
              console.log('[content] 用户已登录，继续请求');
              
              // 将文本封装成JSON格式
              const body = {
                before_texts: texts.before || [],
                after_texts: texts.after || [],
                content: content
              };
          
              // 获取认证头
              const authHeaders = window.loginManager.getAuthHeaders();
              console.log('[content] 认证头信息:', authHeaders);
              
              // 创建完整的请求头
              const headers = {
                'Content-Type': 'application/json',
                ...authHeaders
              };
              
              console.log('[content] 发送请求头:', headers);
          
              // 发送POST请求到服务务器
              fetch('https://a.reotrip.com/ai/extract_form_fields/', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
              })
              .then(response => {
                // 检查响应状态
                if (!response.ok) {
                  if (response.status === 403) {
                    console.error('[content] 认证失败：请先登录');
                    // 可以在这里触发登录流程
                    return Promise.reject(new Error('认证错误：请先登录'));
                  }
                  return Promise.reject(new Error(`服务器响应错误 ${response.status}`));
                }
                return response.json();
              })
              .then(data => {
                console.log('[content] 服务器响应:', data);
              })
              .catch(error => {
                console.error('[content] 请求失败:', error);
              });
          
              // 转换为JSON字符串
              const jsonData = JSON.stringify(body, null, 2);
              
              console.log('[content] 文本数据JSON格式:', jsonData);
            })
            .catch(error => {
              console.error('[content] 检查登录状态时出错:', error);
            });
        } else {
          console.error('[content] 获取文本框内容失败:', response ? response.error : '无响应');
        }
      });
    });
    
    // 判断元素是否已显示，避免重复添加
    const buttonId = `xpath-btn-${index}`;
    if (!document.getElementById(buttonId)) {
      button.id = buttonId;
      
      // 将按钮插入到元素后面
      if (input.parentNode) {
        // 创建一个包装容器，避免破坏页面布局
        const wrapper = document.createElement('span');
        wrapper.style.cssText = 'display: inline-block; vertical-align: middle;';
        wrapper.appendChild(button);
        
        // 找到元素的下一个兄弟节点作为参考
        const nextSibling = input.nextSibling;
        if (nextSibling) {
          input.parentNode.insertBefore(wrapper, nextSibling);
        } else {
          input.parentNode.appendChild(wrapper);
        }
      }
    }
  });
  
  console.log('[content] Autofill按钮添加完成');
}

// 在页面加载完成和DOM变化时添加按钮
function initXPathButtons() {
  // 页面加载完成后添加按钮
  addXPathButtonsToInputs();
  
  // 使用MutationObserver监听DOM变化
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        // DOM发生变化，重新添加按钮
        addXPathButtonsToInputs();
      }
    });
  });
  
  // 开始观察整个文档
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 在页面准备就绪时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initXPathButtons);
} else {
  initXPathButtons();
} 